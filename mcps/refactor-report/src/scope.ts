import type { Git } from "./git.ts";
import { parseSource, declarationsOf, resolveSymbol } from "./parse.ts";
import type { ParsedFile, SymbolDeclaration, SymbolKind } from "./parse.ts";
import type { Workspace } from "./workspace.ts";
import { WorkspaceError } from "./workspace.ts";
import { isMeasurablePath } from "./workspace.ts";

export type SkippedFile = { readonly path: string; readonly reason: "deleted" };

export type ResolvedDiffScope = {
  readonly mode: "diff";
  readonly base: string;
  readonly base_commit: string;
  readonly files: readonly string[];
  readonly skipped: readonly SkippedFile[];
};

// R1: the area selector is one of four granularities; the first two select by the
// name a declaration carries in one file, the third by a path, the fourth by the root.
export type AreaSelection =
  | {
      readonly kind: "function" | "class";
      readonly path: string;
      readonly symbol: string;
    }
  | { readonly kind: "module"; readonly path: string }
  | { readonly kind: "repository" };

export type ResolvedArea =
  | {
      readonly kind: "function" | "class";
      readonly path: string;
      readonly symbol: string;
      readonly start_line: number;
    }
  | { readonly kind: "module"; readonly path: string }
  | { readonly kind: "repository" };

// Area scope carries the diff keys as null so the response layer spreads one shape
// for both modes instead of branching on it; base_commit is null in area by contract.
export type ResolvedAreaScope = {
  readonly mode: "area";
  readonly base: null;
  readonly base_commit: null;
  readonly area: ResolvedArea;
  readonly files: readonly string[];
  readonly skipped: readonly SkippedFile[];
};

// The request arrives unparsed at this seam: the service layer runs the schema in
// front of it, and the mode guard below is what survives a schema that named more
// than one mode or none.
export type ScopeRequest = {
  readonly scope?: {
    readonly mode?: unknown;
    readonly base?: unknown;
    readonly paths?: unknown;
    readonly area?: unknown;
  };
};

// D3: the scope is exactly one mode, and that is decided before any file is read
// and before git runs, so an ambiguous request costs neither a read nor a
// subprocess.
function diffBaseOf(request: ScopeRequest): string {
  const scope = request.scope;
  if (scope === undefined || scope.mode === undefined) {
    throw new WorkspaceError(
      "SCOPE_MISSING",
      "measure needs exactly one scope mode; this request carries none",
    );
  }
  if (scope.mode !== "diff" && scope.mode !== "area") {
    throw new WorkspaceError(
      "SCOPE_INVALID",
      `the scope mode is "diff" or "area"; this request carries ${JSON.stringify(scope.mode)}`,
    );
  }
  if (scope.mode === "diff" && scope.area !== undefined) {
    throw new WorkspaceError(
      "SCOPE_DOUBLE",
      "the request carries both a diff mode and an area object",
    );
  }
  if (scope.mode === "area" && scope.base !== undefined) {
    throw new WorkspaceError(
      "SCOPE_DOUBLE",
      "the request carries both an area mode and a diff base",
    );
  }
  if (typeof scope.base !== "string" || scope.base === "") {
    throw new WorkspaceError(
      "SCOPE_INVALID",
      "the diff mode needs a non-empty string base; this request carries none",
    );
  }
  return scope.base;
}

// The schema fixes the element type; a request that reaches this seam with
// anything else is refused here, before the set is resolved.
function requestedPathsOf(scope: ScopeRequest["scope"]): readonly string[] | undefined {
  const requested = scope?.paths;
  if (requested === undefined) {
    return undefined;
  }
  if (!Array.isArray(requested) || !requested.every((entry) => typeof entry === "string")) {
    throw new WorkspaceError(
      "SCOPE_INVALID",
      "the diff mode takes paths as an array of relative paths; this request carries another shape",
    );
  }
  return requested as readonly string[];
}

// `paths` narrows the set the diff resolved and never adds to it: what changed
// outside the request is not this answer's business, and a requested path the
// set does not hold is a name to correct, listed instead of silently dropped.
function restrictToRequested(
  files: readonly string[],
  requested: readonly string[] | undefined,
): readonly string[] {
  if (requested === undefined) {
    return files;
  }
  const wanted = [...new Set(requested.map(normalizePath))];
  const held: ReadonlySet<string> = new Set(files);
  const missing = wanted.filter((file) => !held.has(file));
  if (missing.length > 0) {
    throw new WorkspaceError(
      "PATH_NOT_IN_SCOPE",
      `the request names ${missing.length} path(s) the ${files.length} changed files do not hold`,
      missing,
    );
  }
  const selected: ReadonlySet<string> = new Set(wanted);
  return files.filter((file) => selected.has(file));
}

export async function resolveDiffScope(
  request: ScopeRequest,
  git: Git,
): Promise<ResolvedDiffScope> {
  const base = diffBaseOf(request);
  const requested = requestedPathsOf(request.scope);
  const baseCommit = await git.resolveCommit(base);
  // R2: the diff against the base misses a file git does not track yet, so the
  // measured set is the union of both listings, without duplicates.
  const [changed, untracked, deleted] = await Promise.all([
    git.changedPaths(base),
    git.untrackedPaths(),
    git.deletedPaths(base),
  ]);
  const gone: ReadonlySet<string> = new Set(deleted);
  const resolved = [...new Set([...changed, ...untracked])]
    .filter((file) => !gone.has(file))
    .sort();
  const files = restrictToRequested(resolved, requested);
  const skipped: SkippedFile[] = [...gone]
    .sort()
    .map((file) => ({ path: file, reason: "deleted" }));
  return { mode: "diff", base, base_commit: baseCommit, files, skipped };
}

// A module path names a file or a directory, and the measured set is what the
// enumeration holds below it: the TypeScript files, with the directories
// workspace already skips (node_modules, dist, .git) left out.
function normalizePath(relativePath: string): string {
  return relativePath.replace(/^\.\//, "").replace(/\/+$/, "");
}

function moduleFiles(files: readonly string[], requested: string): readonly string[] {
  const target = normalizePath(requested);
  const prefix = `${target}/`;
  return files.filter(
    (file) => isMeasurablePath(file) && (file === target || file.startsWith(prefix)),
  );
}

// "repository" is the root minus what a measure must not count as source: the
// directories a build, a code generator or a vendored copy writes into at any
// depth, and the generated files themselves. workspace already skips
// node_modules, dist and .git.
const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  "build",
  "out",
  "coverage",
  "vendor",
  "third_party",
  "generated",
]);

const GENERATED_FILE = /\.(generated|gen)\.(ts|tsx|mts|cts)$/;

function isSourceFile(file: string): boolean {
  if (!isMeasurablePath(file) || GENERATED_FILE.test(file)) {
    return false;
  }
  return !file
    .split("/")
    .slice(0, -1)
    .some((segment) => EXCLUDED_DIRECTORIES.has(segment));
}

function candidateLines(parsed: ParsedFile, filePath: string, kind: SymbolKind): string[] {
  return declarationsOf(parsed)
    .filter((declaration) => declaration.kind === kind)
    .map((declaration) => `${filePath}:${declaration.start_line}`);
}

function declaredNames(parsed: ParsedFile, kind: SymbolKind): string {
  const named = declarationsOf(parsed)
    .filter((declaration) => declaration.kind === kind)
    .map((declaration) => `${declaration.name} (line ${declaration.start_line})`);
  if (named.length === 0) {
    return `the file declares no ${kind}`;
  }
  return `the file declares ${named.join(", ")}`;
}

// A symbol selector names exactly one declaration. Zero matches is a name to
// correct; several matches is a question only the caller can answer, because an
// overload set and the same method name in two classes are both real. The error
// lists the candidate lines either way and picks nothing by proximity.
function exactlyOne(
  area: {
    readonly kind: "function" | "class";
    readonly path: string;
    readonly symbol: string;
  },
  filePath: string,
  parsed: ParsedFile,
  matches: readonly SymbolDeclaration[],
): SymbolDeclaration {
  const [declaration, ...others] = matches;
  if (declaration !== undefined && others.length === 0) {
    return declaration;
  }
  const named = JSON.stringify(area.symbol);
  const detail =
    declaration === undefined
      ? `no ${area.kind} named ${named} in ${filePath}; ${declaredNames(parsed, area.kind)}`
      : `${named} resolves to ${others.length + 1} declarations in ${filePath}; a selector names exactly one`;
  const paths =
    declaration === undefined
      ? candidateLines(parsed, filePath, area.kind)
      : matches.map((match) => `${filePath}:${match.start_line}`);
  throw new WorkspaceError("SYMBOL_NOT_FOUND", detail, paths);
}

function areaSelectionOf(request: ScopeRequest): AreaSelection {
  const scope = request.scope;
  if (scope === undefined || scope.mode !== "area" || scope.area === undefined) {
    throw new WorkspaceError(
      "SCOPE_INVALID",
      "the area mode needs an area object; this request carries none",
    );
  }
  // D3: one mode, decided before any file is read, exactly as the diff branch does.
  if (scope.base !== undefined) {
    throw new WorkspaceError(
      "SCOPE_DOUBLE",
      "the request carries both an area mode and a diff base",
    );
  }
  // The area already names what to measure, in the selector, so a paths list is a
  // field this mode does not accept and, taken quietly, a filter that never runs.
  if (scope.paths !== undefined) {
    throw new WorkspaceError(
      "SCOPE_INVALID",
      "the area mode takes no paths; its selector already names what to measure",
    );
  }
  return scope.area as AreaSelection;
}

// R2: the area mode reads the tree as it is on disk, so a work tree with no commit
// at all measures the same as one with a long history, and no git command runs
// here at all: this resolver takes no Git dependency.
export async function resolveAreaScope(
  request: ScopeRequest,
  workspace: Workspace,
): Promise<ResolvedAreaScope> {
  const area = areaSelectionOf(request);
  const enumerated = await workspace.listFiles();
  if (area.kind === "repository") {
    return {
      mode: "area",
      base: null,
      base_commit: null,
      area: { kind: "repository" },
      files: enumerated.filter(isSourceFile),
      skipped: [],
    };
  }
  // A path the enumeration does not hold is outside the resolved set: the selector
  // names what the area contains, not what the caller hopes it contains.
  const target = normalizePath(area.path);
  if (area.kind === "module") {
    const selected = moduleFiles(enumerated, target);
    if (selected.length === 0) {
      throw new WorkspaceError(
        "PATH_NOT_IN_SCOPE",
        `the module selector names ${area.path}, which holds no measured file; the area resolved ${enumerated.length} files`,
      );
    }
    return {
      mode: "area",
      base: null,
      base_commit: null,
      area: { kind: "module", path: target },
      files: selected,
      skipped: [],
    };
  }
  if (!enumerated.includes(target)) {
    throw new WorkspaceError(
      "PATH_NOT_IN_SCOPE",
      `the ${area.kind} selector names ${area.path}, which is not one of the ${enumerated.length} files the area resolved`,
    );
  }
  const parsed = parseSource(target, await workspace.readText(target));
  const declaration = exactlyOne(area, target, parsed, resolveSymbol(parsed, area.kind, area.symbol));
  return {
    mode: "area",
    base: null,
    base_commit: null,
    area: {
      kind: area.kind,
      path: target,
      symbol: area.symbol,
      start_line: declaration.start_line,
    },
    files: [target],
    skipped: [],
  };
}
