import { parseArgs } from "node:util";

import { MEASURE_METRICS, MEASURE_VERB, PREVIEW_VERB } from "./contracts.ts";
import type { AreaSelector, MeasureMetric, MeasureRequest, PreviewRequest } from "./contracts.ts";
import { errorBody } from "./errors.ts";
import { createGit } from "./git.ts";
import { runMeasure } from "./measure.ts";
import { PREVIEW_SELECT_IDS, runPreview, selectPreviewAnswer } from "./preview.ts";
import type { PreviewSelect } from "./preview.ts";
import { openWorkspace, WorkspaceError } from "./workspace.ts";

// The grammar of the plan, in argv form. Exit 0 carries a report, exit 1 carries a
// typed error body, and exit 2 carries a command line this grammar does not spell.
export const EXIT_OK = 0;
export const EXIT_TYPED_ERROR = 1;
export const EXIT_MALFORMED_ARGV = 2;

const USAGE = [
  "usage: node dist/cli.js measure (--diff <base> [--path <p>]... | --area <selector>) [--select <id>[,<id>...]]",
  "       node dist/cli.js preview --recipe <file>.yaml#sha256:<12> [--rule <id>]... --path <p> [--path <p>]... [--select diff|ranges|delta|all]",
  "  <selector> := function:<path>#<symbol> | class:<path>#<symbol> | module:<path> | repository",
].join("\n");

// A command line the grammar cannot read. It is not a failure of the service and
// carries no code of the contract, so it leaves as exit 2 and never as exit 1.
class MalformedArgument extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "MalformedArgument";
  }
}

const OPTIONS = {
  diff: { type: "string" },
  path: { type: "string", multiple: true },
  area: { type: "string" },
  select: { type: "string" },
  recipe: { type: "string" },
  rule: { type: "string", multiple: true },
} as const;

type ParsedArguments = {
  readonly diff?: string;
  readonly path?: readonly string[];
  readonly area?: string;
  readonly select?: string;
  readonly recipe?: string;
  readonly rule?: readonly string[];
};

// Every refusal of the flag parser is a malformed command line: an unknown flag, a
// flag without its value and a positional the grammar has no room for.
function parseCommandLine(line: readonly string[]): ParsedArguments {
  try {
    const parsed = parseArgs({
      args: [...line],
      options: OPTIONS,
      allowPositionals: false,
      strict: true,
    });
    return parsed.values as ParsedArguments;
  } catch (error) {
    throw new MalformedArgument(error instanceof Error ? error.message : String(error));
  }
}

const METRIC_IDS: ReadonlySet<string> = new Set(MEASURE_METRICS);

// `--select` is a projection of the report, exactly as the request field is: an id
// outside the vocabulary is a command line the grammar does not spell.
function selectedMetricsOf(select: string | undefined): readonly MeasureMetric[] | undefined {
  if (select === undefined) {
    return undefined;
  }
  const named = [...new Set(select.split(",").map((part) => part.trim()))];
  const unknown = named.filter((id) => !METRIC_IDS.has(id));
  if (named.includes("") || unknown.length > 0) {
    throw new MalformedArgument(
      `--select takes ids of the metric vocabulary ${JSON.stringify([...MEASURE_METRICS])}; this command names ${JSON.stringify(unknown)}`,
    );
  }
  return named as readonly MeasureMetric[];
}

// The area selector, spelled as the evidence commands print it: a symbol
// granularity is <kind>:<path>#<symbol>, a module is <kind>:<path>, and the root is
// the bare word.
function selectorOf(spelled: string): AreaSelector {
  if (spelled === "repository") {
    return { kind: "repository" };
  }
  const separator = spelled.indexOf(":");
  if (separator <= 0 || separator === spelled.length - 1) {
    throw new MalformedArgument(
      `the selector is "<kind>:<path>[#<symbol>]" or "repository"; this command names ${JSON.stringify(spelled)}`,
    );
  }
  const kind = spelled.slice(0, separator);
  const rest = spelled.slice(separator + 1);
  if (kind === "module") {
    return { kind: "module", path: rest };
  }
  if (kind !== "function" && kind !== "class") {
    throw new MalformedArgument(
      `the selector kind is "[function|class]:" , "module:" or "repository"; this command names ${JSON.stringify(kind)}`,
    );
  }
  const hash = rest.indexOf("#");
  if (hash <= 0 || hash === rest.length - 1) {
    throw new MalformedArgument(
      `the ${kind} selector is "${kind}:<path>#<symbol>"; this command names ${JSON.stringify(spelled)}`,
    );
  }
  return { kind, path: rest.slice(0, hash), symbol: rest.slice(hash + 1) };
}

// D3: the scope is exactly one mode, and the grammar spells the two branches as an
// alternation, so a command line naming both or neither is one the grammar has no
// reading for.
function diffRequest(
  base: string,
  paths: readonly string[] | undefined,
  selected: readonly MeasureMetric[] | undefined,
): MeasureRequest {
  if (base === "") {
    throw new MalformedArgument("--diff takes a non-empty base; this command names an empty one");
  }
  const scope = paths === undefined ? { mode: "diff" as const, base } : { mode: "diff" as const, base, paths: [...paths] };
  return { scope, ...(selected === undefined ? {} : { select: selected }) };
}

function areaRequest(
  spelled: string,
  paths: readonly string[] | undefined,
  selected: readonly MeasureMetric[] | undefined,
): MeasureRequest {
  if (paths !== undefined) {
    throw new MalformedArgument(
      "--path belongs to the diff branch; the area selector already names what to measure",
    );
  }
  return {
    scope: { mode: "area", area: selectorOf(spelled) },
    ...(selected === undefined ? {} : { select: selected }),
  };
}

function requestOf(parsed: ParsedArguments): MeasureRequest {
  // The recipe flags belong to the other verb; measured here, they would be a
  // selection of rules that quietly did nothing.
  if (parsed.recipe !== undefined || parsed.rule !== undefined) {
    throw new MalformedArgument(
      "--recipe and --rule belong to preview; measure names its scope with --diff or --area",
    );
  }
  const selected = selectedMetricsOf(parsed.select);
  if (parsed.diff !== undefined && parsed.area !== undefined) {
    throw new MalformedArgument("the grammar takes one scope mode, and this command names both --diff and --area");
  }
  if (parsed.diff !== undefined) {
    return diffRequest(parsed.diff, parsed.path, selected);
  }
  if (parsed.area !== undefined) {
    return areaRequest(parsed.area, parsed.path, selected);
  }
  throw new MalformedArgument("the grammar takes one scope mode, and this command names none");
}

// D8: the CLI is the argv form of the same service and calls the same function, so
// a number the command reports is the number the tool reports. D2: the root is the
// working directory of the entry, resolved once here.
async function measureToStdout(parsed: ParsedArguments): Promise<void> {
  const request = requestOf(parsed);
  const workspace = await openWorkspace(process.cwd());
  const git = createGit(workspace);
  const response = await runMeasure(request, { workspace, git });
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

// R5/D8: the recipe as the request carries it: the rule set named by the prefix of
// its content digest, the rules it selects and the files it would touch. A verb's
// flags on the other verb's command line are one the grammar has no reading for.
function previewRequestOf(parsed: ParsedArguments): PreviewRequest {
  if (parsed.diff !== undefined || parsed.area !== undefined) {
    throw new MalformedArgument(
      "--diff and --area belong to measure; preview names its files with --path",
    );
  }
  if (parsed.recipe === undefined || parsed.recipe === "") {
    throw new MalformedArgument("preview takes --recipe <file>.yaml#sha256:<12>");
  }
  if (parsed.path === undefined || parsed.path.length === 0) {
    throw new MalformedArgument("preview takes at least one --path");
  }
  return {
    recipe: {
      ruleset: parsed.recipe,
      ...(parsed.rule === undefined ? {} : { rules: [...parsed.rule] }),
    },
    paths: [...parsed.path],
  };
}

// `--select` narrows the printed answer to the value a caller asked the evidence
// command for; without it the entry prints the whole document.
function previewSelectOf(select: string | undefined): PreviewSelect {
  if (select === undefined) {
    return "all";
  }
  const named = PREVIEW_SELECT_IDS.find((candidate) => candidate === select);
  if (named === undefined) {
    throw new MalformedArgument(
      `--select takes ${PREVIEW_SELECT_IDS.join(", ")} for preview; this command names ${JSON.stringify(select)}`,
    );
  }
  return named;
}

async function previewToStdout(parsed: ParsedArguments): Promise<void> {
  const request = previewRequestOf(parsed);
  const select = previewSelectOf(parsed.select);
  const workspace = await openWorkspace(process.cwd());
  const response = await runPreview(request, { workspace });
  process.stdout.write(`${JSON.stringify(selectPreviewAnswer(response, select))}\n`);
}

async function main(argv: readonly string[]): Promise<number> {
  const [verb, ...line] = argv;
  if (verb === MEASURE_VERB) {
    await measureToStdout(parseCommandLine(line));
    return EXIT_OK;
  }
  if (verb === PREVIEW_VERB) {
    await previewToStdout(parseCommandLine(line));
    return EXIT_OK;
  }
  throw new MalformedArgument(
    `this entry serves ${JSON.stringify(MEASURE_VERB)} and ${JSON.stringify(PREVIEW_VERB)}; this command names ${JSON.stringify(verb ?? null)}`,
  );
}

// A failure the service named keeps its code: the CLI prints the same body the tool
// writes into its text content block, so a caller parses one shape on both surfaces.
function typedErrorBody(error: WorkspaceError): string {
  return errorBody(
    error.paths === undefined
      ? { code: error.code, detail: error.message }
      : { code: error.code, detail: error.message, paths: error.paths },
  );
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof MalformedArgument) {
    process.stderr.write(`refactor-report: ${error.message}\n${USAGE}\n`);
    process.exitCode = EXIT_MALFORMED_ARGV;
  } else if (error instanceof WorkspaceError) {
    process.stderr.write(`${typedErrorBody(error)}\n`);
    process.exitCode = EXIT_TYPED_ERROR;
  } else {
    process.stderr.write(`refactor-report: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = EXIT_TYPED_ERROR;
  }
}
