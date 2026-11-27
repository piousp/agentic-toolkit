import { parseArgs } from "node:util";

import { MEASURE_METRICS, MEASURE_VERB } from "./contracts.ts";
import type { AreaSelector, MeasureMetric, MeasureRequest } from "./contracts.ts";
import { errorBody } from "./errors.ts";
import { createGit } from "./git.ts";
import { runMeasure } from "./measure.ts";
import { openWorkspace, WorkspaceError } from "./workspace.ts";

// The grammar of the plan, in argv form. Exit 0 carries a report, exit 1 carries a
// typed error body, and exit 2 carries a command line this grammar does not spell.
export const EXIT_OK = 0;
export const EXIT_TYPED_ERROR = 1;
export const EXIT_MALFORMED_ARGV = 2;

const USAGE = [
  "usage: node dist/cli.js measure (--diff <base> [--path <p>]... | --area <selector>) [--select <id>[,<id>...]]",
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
} as const;

type ParsedArguments = {
  readonly diff?: string;
  readonly path?: readonly string[];
  readonly area?: string;
  readonly select?: string;
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

async function main(argv: readonly string[]): Promise<number> {
  const [verb, ...line] = argv;
  if (verb !== MEASURE_VERB) {
    throw new MalformedArgument(
      `the only verb this entry serves is ${JSON.stringify(MEASURE_VERB)}; this command names ${JSON.stringify(verb ?? null)}`,
    );
  }
  await measureToStdout(parseCommandLine(line));
  return EXIT_OK;
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
