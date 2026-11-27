import path from "node:path";

import { MEASURE_LANGUAGE, MEASURE_METRICS, MEASURE_METRICSET, MEASURE_VERB } from "./contracts.ts";
import type {
  AreaSelector,
  MeasureEvidence,
  MeasureEvidenceEntry,
  MeasureFileEntry,
  MeasureMetric,
  MeasureRequest,
  MeasureResponse,
  MeasureScopeSummary,
} from "./contracts.ts";
import { canonicalDigest } from "./digest.ts";
import type { Git } from "./git.ts";
import { buildImportGraph } from "./imports.ts";
import { measureFile } from "./metrics.ts";
import type { FileMetrics } from "./metrics.ts";
import { resolveAreaScope, resolveDiffScope } from "./scope.ts";
import type { ResolvedArea, ResolvedDiffScope, ResolvedAreaScope } from "./scope.ts";
import { REPORTED_ROOT, WorkspaceError } from "./workspace.ts";
import type { Workspace } from "./workspace.ts";

// D9: the enumeration above this many files is refused instead of truncated. A
// report that measured part of the tree in silence is worse than no report.
export const MEASURE_MAX_FILES = 2000;

export type MeasureDeps = {
  readonly workspace: Workspace;
  readonly git: Git;
};

type ResolvedScope = ResolvedDiffScope | ResolvedAreaScope;

// The request arrives unvalidated at this seam: the schema in front of the service
// owns the shape, and the resolvers own which mode the request carries. Reading the
// scope through this view keeps the selector check below from trusting either.
type ScopeView = {
  readonly mode?: unknown;
  readonly area?: unknown;
};

// A repository selector declares no path at all, so the guard reads the field out
// of the union instead of assuming every area carries one.
function selectorPathOf(area: unknown): unknown {
  if (typeof area !== "object" || area === null) {
    return undefined;
  }
  return (area as { readonly path?: unknown }).path;
}

// R3: the answer is a document the caller can paste into a report, so no absolute
// path may reach it. A selector that arrives absolute is refused here, before the
// resolver reads anything or quotes the path back in a detail.
function assertRelativeSelectorPath(request: MeasureRequest): void {
  const scope: ScopeView = request.scope;
  if (scope.mode !== "area") {
    return;
  }
  const candidate = selectorPathOf(scope.area);
  if (typeof candidate === "string" && path.isAbsolute(candidate)) {
    throw new WorkspaceError(
      "PATH_OUTSIDE_ROOT",
      "a selector path is relative to the workspace root; an absolute path cannot be resolved",
    );
  }
}

async function resolveScope(request: MeasureRequest, deps: MeasureDeps): Promise<ResolvedScope> {
  assertRelativeSelectorPath(request);
  return request.scope.mode === "diff"
    ? resolveDiffScope(request, deps.git)
    : resolveAreaScope(request, deps.workspace);
}

// The response echoes the selector the request named, normalised by the resolver:
// a symbol selection is its path and its symbol and nothing else about the ast.
function selectorOf(area: ResolvedArea): AreaSelector {
  if (area.kind === "function" || area.kind === "class") {
    return { kind: area.kind, path: area.path, symbol: area.symbol };
  }
  if (area.kind === "module") {
    return { kind: "module", path: area.path };
  }
  return { kind: "repository" };
}

function scopeSummary(scope: ResolvedScope): MeasureScopeSummary {
  return {
    mode: scope.mode,
    base: scope.base,
    base_commit: scope.base_commit,
    area: scope.mode === "area" ? selectorOf(scope.area) : null,
    files: [...scope.files],
    skipped: [...scope.skipped],
  };
}

// The evidence surface is the CLI grammar the package publishes: the selector form
// of the same scope, and the file the number belongs to where the grammar can name
// one.
function scopeArguments(scope: ResolvedScope): string[] {
  if (scope.mode !== "area") {
    return ["--diff", scope.base];
  }
  const area = scope.area;
  if (area.kind === "function" || area.kind === "class") {
    return ["--area", `${area.kind}:${area.path}#${area.symbol}`];
  }
  if (area.kind === "module") {
    return ["--area", `module:${area.path}`];
  }
  return ["--area", "repository"];
}

// R3: `select` is a projection of the report, so a request without it keeps the
// whole vocabulary and a request with it keeps exactly the metrics it names, in
// the order the vocabulary fixes.
function selectedMetrics(request: MeasureRequest): readonly MeasureMetric[] {
  const requested = request.select;
  if (requested === undefined) {
    return MEASURE_METRICS;
  }
  const named: ReadonlySet<string> = new Set(requested);
  return MEASURE_METRICS.filter((metric) => named.has(metric));
}

// R4/D8: a reported number travels with the exact command that reproduces it, so
// the answer is auditable without trusting the server, and only for the metrics
// that travelled.
function evidenceFor(
  scope: ResolvedScope,
  filePath: string,
  selected: readonly MeasureMetric[],
): MeasureEvidence {
  const argv = ["node", "dist", "cli.js", "measure", ...scopeArguments(scope)];
  if (scope.mode === "diff") {
    argv.push("--path", filePath);
  }
  const evidence: Partial<Record<MeasureMetric, MeasureEvidenceEntry>> = {};
  for (const metric of selected) {
    evidence[metric] = { command: [...argv, "--select", metric].join(" ") };
  }
  return evidence;
}

// One file entry of the answer, with the metrics the request selected and no
// others: an absent key says "not reported", where a zero would say "measured".
function fileEntryOf(
  filePath: string,
  text: string,
  measured: FileMetrics,
  importers: number,
  selected: readonly MeasureMetric[],
  scope: ResolvedScope,
): MeasureFileEntry {
  const wanted = (metric: MeasureMetric): boolean => selected.includes(metric);
  return {
    path: filePath,
    ...(wanted("sha256") ? { sha256: canonicalDigest(text) } : {}),
    ...(wanted("loc") ? { loc: measured.loc } : {}),
    ...(wanted("functions") ? { functions: measured.functions } : {}),
    ...(wanted("max_complexity") ? { max_complexity: measured.max_complexity } : {}),
    ...(wanted("importers") ? { importers } : {}),
    evidence: evidenceFor(scope, filePath, selected),
  };
}

export async function runMeasure(
  request: MeasureRequest,
  deps: MeasureDeps,
): Promise<MeasureResponse> {
  const scope = await resolveScope(request, deps);
  const graph = await buildImportGraph(deps.workspace);
  const selected = selectedMetrics(request);

  const files: MeasureFileEntry[] = [];
  for (const filePath of scope.files) {
    const text = await deps.workspace.readText(filePath);
    const measured = measureFile(filePath, text);
    files.push(
      fileEntryOf(filePath, text, measured, graph.importersOf(filePath).count, selected, scope),
    );
  }

  return {
    verb: MEASURE_VERB,
    metricset: MEASURE_METRICSET,
    language: MEASURE_LANGUAGE,
    root: REPORTED_ROOT,
    scope: scopeSummary(scope),
    files,
  };
}
