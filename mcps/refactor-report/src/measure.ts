import { createHash } from "node:crypto";
import path from "node:path";

import {
  evidenceCommand,
  MEASURE_LANGUAGE,
  MEASURE_METRICS,
  MEASURE_METRICSET,
  MEASURE_VERB,
} from "./contracts.ts";
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
  // D9: the ceiling is a dependency so a case can pin it with a small number;
  // the default is the limit the plan fixed and the one a real run applies.
  readonly maxFiles?: number;
};

type ResolvedScope = ResolvedDiffScope | ResolvedAreaScope;

// The request arrives unvalidated at this seam: the schema in front of the service
// owns the shape, and the resolvers own which mode the request carries. Reading the
// scope through this view keeps the selector check below from trusting either.
type ScopeView = {
  readonly mode?: unknown;
  readonly paths?: unknown;
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

// R3/R5: the answer is a document the caller can paste into a report, so no path
// outside the root may reach it. Every path surface of the request is refused here,
// before either resolver reads anything: the area selector's path and the diff
// `paths`. A relative path stays inside the root while its normalised first segment is
// a name; an absolute one and one whose normalised form opens with `..` leave the tree,
// and a name that only begins with dots, like `src/..data.ts`, stays measurable. The
// refused value is never quoted: an absolute one would carry the root into the answer.
function escapesRoot(candidate: string): boolean {
  if (path.isAbsolute(candidate)) {
    return true;
  }
  return path.normalize(candidate).split(path.sep)[0] === "..";
}

function assertPathsInsideRoot(request: MeasureRequest): void {
  const scope: ScopeView = request.scope;
  const entries: string[] = [];
  if (scope.mode === "area") {
    const candidate = selectorPathOf(scope.area);
    if (typeof candidate === "string") {
      entries.push(candidate);
    }
  }
  if (scope.mode === "diff" && Array.isArray(scope.paths)) {
    for (const entry of scope.paths as readonly unknown[]) {
      if (typeof entry === "string") {
        entries.push(entry);
      }
    }
  }
  if (entries.some(escapesRoot)) {
    throw new WorkspaceError(
      "PATH_OUTSIDE_ROOT",
      "a path in the request is relative to the workspace root and stays inside it; an absolute path or one that climbs out of the root cannot be resolved",
    );
  }
}

// D3: the area mode is the one branch that reads no history, so the selection names
// that branch and every other document reaches the diff resolver. That resolver is the
// one that decides whether the request carries a diff, no mode at all or a mode
// outside the two, so a missing mode comes back as SCOPE_MISSING instead of a code
// borrowed from the branch the request never asked for.
async function resolveScope(request: MeasureRequest, deps: MeasureDeps): Promise<ResolvedScope> {
  assertPathsInsideRoot(request);
  return request.scope.mode === "area"
    ? resolveAreaScope(request, deps.workspace)
    : resolveDiffScope(request, deps.git);
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
// of the same scope, plus the file the number belongs to, so the command answers one
// file entry and the value it carries is the number that travelled with it. The area
// mode names the file as a module selector because the grammar gives the diff branch
// the only `--path`; the per-file numbers are the same in both granularities.
function scopeArguments(scope: ResolvedScope, filePath: string): string[] {
  if (scope.mode === "diff") {
    return ["--diff", scope.base, "--path", filePath];
  }
  return ["--area", `module:${filePath}`];
}

// D9/R3: the digest is the sha256 of the bytes the file holds on disk, not of a
// canonical form of its text, so `sha256sum <file>` prints the same value the gate
// recomputes from the manifest line "<sha256>  <path>": the caller re-measures the
// tree without believing this server. A text file is measured as the utf8 bytes the
// workspace read, which are the bytes on disk for every source file it reads.
function contentDigest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
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
// that travelled. R3: the command is written against the measured root, so it runs in
// the tree whose number it reproduces.
function evidenceFor(
  scope: ResolvedScope,
  filePath: string,
  selected: readonly MeasureMetric[],
  workspaceRoot: string,
): MeasureEvidence {
  const args = ["measure", ...scopeArguments(scope, filePath)];
  const evidence: Partial<Record<MeasureMetric, MeasureEvidenceEntry>> = {};
  for (const metric of selected) {
    evidence[metric] = { command: evidenceCommand(workspaceRoot, [...args, "--select", metric]) };
  }
  return evidence;
}

// R3: the per-unit breakdown belongs to a symbol selector, which asked for one
// file's units; the module and repository granularities report the file metrics and
// no list the caller would have to reduce to a number itself.
function reportsUnits(scope: ResolvedScope): boolean {
  if (scope.mode !== "area") {
    return false;
  }
  return scope.area.kind === "function" || scope.area.kind === "class";
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
  workspaceRoot: string,
): MeasureFileEntry {
  const wanted = (metric: MeasureMetric): boolean => selected.includes(metric);
  return {
    path: filePath,
    ...(wanted("sha256") ? { sha256: contentDigest(text) } : {}),
    ...(wanted("loc") ? { loc: measured.loc } : {}),
    ...(wanted("functions") ? { functions: measured.functions } : {}),
    ...(wanted("max_complexity") ? { max_complexity: measured.max_complexity } : {}),
    ...(wanted("importers") ? { importers } : {}),
    ...(reportsUnits(scope) ? { units: measured.units } : {}),
    evidence: evidenceFor(scope, filePath, selected, workspaceRoot),
  };
}

// D9: the ceiling fails closed. A tree above it is refused, never measured in part:
// the caller re-measures the tree itself and a truncated report would look complete.
function assertWithinFileLimit(measured: number, limit: number): void {
  if (measured > limit) {
    throw new WorkspaceError(
      "FILES_OVER_LIMIT",
      `the scope resolved ${measured} files; the limit is ${limit}, and a larger tree is refused instead of truncated`,
    );
  }
}

export async function runMeasure(
  request: MeasureRequest,
  deps: MeasureDeps,
): Promise<MeasureResponse> {
  const scope = await resolveScope(request, deps);
  // Before the graph and before the first read: nothing is measured above the limit.
  assertWithinFileLimit(scope.files.length, deps.maxFiles ?? MEASURE_MAX_FILES);
  const graph = await buildImportGraph(deps.workspace);
  const selected = selectedMetrics(request);
  const workspaceRoot = deps.workspace.root;

  const files: MeasureFileEntry[] = [];
  for (const filePath of scope.files) {
    const text = await deps.workspace.readText(filePath);
    const measured = measureFile(filePath, text);
    files.push(
      fileEntryOf(
        filePath,
        text,
        measured,
        graph.importersOf(filePath).count,
        selected,
        scope,
        workspaceRoot,
      ),
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
