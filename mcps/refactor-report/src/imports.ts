import path from "node:path";

import ts from "typescript";

import { parseSource } from "./parse.ts";
import type { Workspace } from "./workspace.ts";

export type Importers = {
  readonly count: number;
  readonly modules: readonly string[];
};

export type ImportGraph = {
  importersOf(relativePath: string): Importers;
};

const NO_IMPORTERS: Importers = { count: 0, modules: [] };

// R7: the graph spans the modules the package can read, and only those. The order
// of the extensions is the precedence two candidates for one specifier follow.
const MODULE_EXTENSIONS: readonly string[] = [".ts", ".tsx", ".mts", ".cts"];
const MODULE_EXTENSION_SET: ReadonlySet<string> = new Set(MODULE_EXTENSIONS);

function isModuleFile(relativePath: string): boolean {
  return MODULE_EXTENSION_SET.has(path.extname(relativePath));
}

// A specifier is internal only when it is relative: a bare specifier names an
// external package and an absolute one cannot be resolved inside the root.
function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

// A re-export binds the origin to the barrel exactly like an import binds it to
// its importer, so both declaration kinds contribute a specifier.
function moduleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

// A specifier that climbs out of the root, or that names no enumerated module,
// is not an edge: the graph never holds a path the enumeration does not hold.
// A directory specifier resolves to its index the same way a file specifier
// resolves to an extension: the exact candidate wins, then the extensions in the
// declared order, then the same for the directory index.
function candidatesFor(base: string): string[] {
  return [
    base,
    ...MODULE_EXTENSIONS.map((extension) => base + extension),
    ...MODULE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
}

function resolveSpecifier(
  importer: string,
  specifier: string,
  modules: ReadonlySet<string>,
): string | null {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  if (base.startsWith("../") || base === "..") {
    return null;
  }
  for (const candidate of candidatesFor(base)) {
    if (modules.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function collectEdges(
  importer: string,
  sourceFile: ts.SourceFile,
  modules: ReadonlySet<string>,
  importers: Map<string, string[]>,
): void {
  for (const specifier of moduleSpecifiers(sourceFile)) {
    if (!isRelativeSpecifier(specifier)) {
      continue;
    }
    const target = resolveSpecifier(importer, specifier, modules);
    if (target === null) {
      continue;
    }
    const known = importers.get(target);
    if (known === undefined) {
      importers.set(target, [importer]);
      continue;
    }
    if (!known.includes(importer)) {
      known.push(importer);
    }
  }
}

// D9: the graph is computed over the enumerated root on every call; nothing is
// cached between calls.
export async function buildImportGraph(workspace: Workspace): Promise<ImportGraph> {
  const modules = (await workspace.listFiles()).filter(isModuleFile);
  const known = new Set(modules);
  const importers = new Map<string, string[]>();

  for (const importer of modules) {
    const { sourceFile } = parseSource(importer, await workspace.readText(importer));
    collectEdges(importer, sourceFile, known, importers);
  }

  return {
    importersOf(relativePath: string): Importers {
      const found = importers.get(relativePath);
      if (found === undefined) {
        return NO_IMPORTERS;
      }
      const sorted = [...found].sort();
      return { count: sorted.length, modules: sorted };
    },
  };
}
