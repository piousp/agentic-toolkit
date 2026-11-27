import {
  evidenceCommand,
  MEASURE_LANGUAGE,
  MEASURE_METRICSET,
  PREVIEW_VERB,
} from "./contracts.ts";
import type { PreviewDelta, PreviewFileEntry, PreviewRequest, PreviewResponse } from "./contracts.ts";
import { canonicalDigest } from "./digest.ts";
import { buildImportGraph } from "./imports.ts";
import { lineDiff, renderedLineCount } from "./linediff.ts";
import type { LineDiff } from "./linediff.ts";
import { measureFile } from "./metrics.ts";
import { parseSource } from "./parse.ts";
import { loadRuleset } from "./rulesets.ts";
import type { Ruleset, RulesetRule } from "./rulesets.ts";
import { transformFile } from "./transform.ts";
import type { TransformDeps } from "./transform.ts";
import { WorkspaceError } from "./workspace.ts";
import type { Workspace } from "./workspace.ts";

// R5: the rendering a caller receives is bounded. Above this many lines the answer is
// refused instead of cut, so a caller never holds half a diff and reads it whole.
export const PREVIEW_MAX_DIFF_LINES = 500;

// S-preview: the service reads the tree through the workspace it is handed and
// answers a document. `applied: false` is the whole of what it does to the tree.
export type PreviewDeps = {
  readonly workspace: Workspace;
  // The ceiling is a dependency for the same reason the file ceiling of `measure`
  // is: a case pins it with a small number and a real run applies the one above.
  readonly maxDiffLines?: number;
};

// One file of the answer before it is rendered: the text the tree holds, the text it
// would hold, and the change between them. A module the recipe creates has no text
// of its own in the tree, so its `before` is the empty text it holds now.
type Planned = {
  readonly path: string;
  readonly status: "modified" | "created";
  readonly before: string;
  readonly after: string;
  readonly change: LineDiff;
};

// R6/D12: a recipe names which rules of the published rule set run. A rule the set
// does not hold is a name to correct, never a rule that silently does nothing.
function selectedRules(
  ruleset: Ruleset,
  requested: readonly string[] | undefined,
): readonly RulesetRule[] {
  if (requested === undefined) {
    return ruleset.rules;
  }
  const known = new Set(ruleset.rules.map((rule) => rule.id));
  const named = [...new Set(requested)];
  const missing = named.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new WorkspaceError(
      "RULE_UNKNOWN",
      `${ruleset.name} holds ${[...known].join(", ")}; the recipe names ${missing.join(", ")}`,
    );
  }
  const wanted = new Set(named);
  return ruleset.rules.filter((rule) => wanted.has(rule.id));
}

// R5: the digest names the change, so it covers what the change is — the path, the
// status, the ranges and the two counts — and nothing a second run could spell
// differently: no timestamp, no absolute path, and the files in the order of their
// path so a request that names them in another order names the same change. The
// canonical form of the digest module orders the keys of every object it reads.
function changeDigestOf(planned: readonly Planned[]): string {
  const files = [...planned]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((file) => ({
      path: file.path,
      status: file.status,
      ranges: file.change.ranges,
      added: file.change.added,
      removed: file.change.removed,
    }));
  return canonicalDigest({ v: 1, files });
}

// R5: a delta is the difference the change would make to the numbers `measure`
// reports for the file, so the two verbs never tell a caller two stories about one
// file. The importer count travels as the pair the caller's tree reports and the
// tree the recipe would leave behind.
function deltaOf(
  planned: Planned,
  importersBefore: number,
  importersAfter: number,
): PreviewDelta {
  const before = measureFile(planned.path, planned.before);
  const after = measureFile(planned.path, planned.after);
  return {
    loc: after.loc - before.loc,
    functions: after.functions - before.functions,
    max_complexity: after.max_complexity.value - before.max_complexity.value,
    importers: importersAfter - importersBefore,
  };
}

// D9: the importer count of a change is the count of a tree that does not exist yet,
// so it is read from an overlay of the texts in memory over the texts on disk. The
// overlay is a workspace like any other and the graph reads it without knowing.
function overlayOf(workspace: Workspace, planned: readonly Planned[]): Workspace {
  const texts = new Map(planned.map((file) => [file.path, file.after]));
  const created = planned
    .filter((file) => file.status === "created")
    .map((file) => file.path);
  return {
    root: workspace.root,
    async listFiles(): Promise<string[]> {
      const enumerated = await workspace.listFiles();
      return [...new Set([...enumerated, ...created])].sort();
    },
    readText(relativePath: string): Promise<string> {
      const planned = texts.get(relativePath);
      return planned === undefined ? workspace.readText(relativePath) : Promise.resolve(planned);
    },
  };
}

// R5: the ceiling fails closed, and it counts what a reader receives: the rendered
// hunks with their headers, summed over the files of the answer.
function assertWithinDiffLimit(planned: readonly Planned[], limit: number): void {
  const rendered = planned.reduce(
    (total, file) => total + renderedLineCount(file.change.diff),
    0,
  );
  if (rendered > limit) {
    throw new WorkspaceError(
      "PREVIEW_OVER_LIMIT",
      `the change renders ${rendered} lines; the ceiling is ${limit}, and a longer rendering is refused instead of cut`,
    );
  }
}

// A path named twice is one file, and the answer names it once.
function uniquePaths(paths: readonly string[]): readonly string[] {
  return [...new Set(paths)];
}

// R4/D8: the evidence surface is the argv form of the same verb, so an evidence
// command names the recipe, the rules and the files the request named, and it is the
// command line the entry reads back. R3: the entry token is left to `evidenceCommand`,
// which writes it against the tree the preview reads.
function previewArguments(request: PreviewRequest): string[] {
  const argv = [PREVIEW_VERB, "--recipe", request.recipe.ruleset];
  for (const rule of request.recipe.rules ?? []) {
    argv.push("--rule", rule);
  }
  for (const filePath of uniquePaths(request.paths)) {
    argv.push("--path", filePath);
  }
  return argv;
}

export async function runPreview(
  request: PreviewRequest,
  deps: PreviewDeps,
): Promise<PreviewResponse> {
  const ruleset = await loadRuleset(request.recipe.ruleset);
  const rules = selectedRules(ruleset, request.recipe.rules);
  // D7: the destination of a module is a file of the measured tree, so the probe
  // answers from the enumeration of that tree and never from a guess.
  const enumerated: ReadonlySet<string> = new Set(await deps.workspace.listFiles());
  const probe: TransformDeps = { targetExists: (relativePath) => enumerated.has(relativePath) };

  // D12: a recipe that matches nothing plans no file, and the empty plan is the
  // answer: nothing to report is a successful report of nothing.
  const planned: Planned[] = [];
  for (const filePath of uniquePaths(request.paths)) {
    const text = await deps.workspace.readText(filePath);
    const outcome = transformFile(parseSource(filePath, text), rules, probe);
    // D12: a file the rules leave as it was is not a change to report. Reporting it
    // would name a path in the answer of a recipe that matched nothing.
    if (outcome.text !== text) {
      planned.push({
        path: filePath,
        status: "modified",
        before: text,
        after: outcome.text,
        change: lineDiff(text, outcome.text),
      });
    }
    for (const module of outcome.modules) {
      planned.push({
        path: module.path,
        status: "created",
        before: "",
        after: module.text,
        change: lineDiff("", module.text),
      });
    }
  }

  // R5: the ceiling is read on the rendering the answer would carry, before the two
  // import graphs of a change nobody will be shown.
  assertWithinDiffLimit(planned, deps.maxDiffLines ?? PREVIEW_MAX_DIFF_LINES);

  const tree = await buildImportGraph(deps.workspace);
  const overlaid = await buildImportGraph(overlayOf(deps.workspace, planned));

  const argv = previewArguments(request);
  const files: PreviewFileEntry[] = planned.map((file) => ({
    path: file.path,
    status: file.status,
    ranges: file.change.ranges,
    diff: file.change.diff,
    delta: deltaOf(file, tree.importersOf(file.path).count, overlaid.importersOf(file.path).count),
    evidence: {
      diff: { command: evidenceCommand(deps.workspace.root, [...argv, "--select", "diff"]) },
      delta: { command: evidenceCommand(deps.workspace.root, [...argv, "--select", "delta"]) },
    },
  }));

  return {
    verb: PREVIEW_VERB,
    applied: false,
    language: MEASURE_LANGUAGE,
    metricset: MEASURE_METRICSET,
    ruleset: {
      name: ruleset.name,
      ruleset_digest: ruleset.ruleset_digest,
      rules: rules.map((rule) => rule.id),
    },
    change_digest: changeDigestOf(planned),
    paths: files.map((file) => file.path),
    files,
    // R4: the two document values are reproduced by the command that prints the
    // document, which is the shortest line a caller can paste for either of them.
    evidence: {
      ruleset_digest: { command: evidenceCommand(deps.workspace.root, argv) },
      change_digest: { command: evidenceCommand(deps.workspace.root, argv) },
    },
  };
}

export const PREVIEW_SELECT_IDS = ["diff", "ranges", "delta", "all"] as const;

export type PreviewSelect = (typeof PREVIEW_SELECT_IDS)[number];

// R4: `--select` is a projection of the answer, as the metric selection of `measure`
// is: the command a value travels with answers that value and nothing else, so a
// caller who replays it reads the number the answer recorded next to it.
export function selectPreviewAnswer(
  answer: PreviewResponse,
  select: PreviewSelect,
): Record<string, unknown> {
  if (select === "all") {
    return answer;
  }
  return {
    ...answer,
    files: answer.files.map((file) => ({
      path: file.path,
      status: file.status,
      [select]: file[select],
      // The diff and the delta travel with a command of their own; a projection of
      // the ranges keeps the evidence the contract fixes for the file.
      evidence: select === "ranges" ? file.evidence : { [select]: file.evidence[select] },
    })),
  };
}
