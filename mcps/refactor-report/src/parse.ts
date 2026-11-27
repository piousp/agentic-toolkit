import path from "node:path";

import ts from "typescript";

import { WorkspaceError } from "./workspace.ts";

// D4: typescript@^5 is a parser here and never a printer: one createSourceFile
// call per file, with the script kind the extension asks for.
const SCRIPT_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
};

export type ParsedFile = {
  readonly path: string;
  readonly sourceFile: ts.SourceFile;
  readonly diagnostics: readonly ts.Diagnostic[];
};

export function scriptKindFor(relativePath: string): ts.ScriptKind {
  const kind = SCRIPT_KINDS[path.extname(relativePath)];
  if (kind === undefined) {
    throw new WorkspaceError(
      "LANGUAGE_UNSUPPORTED",
      `only .ts, .tsx, .mts and .cts are parsed; cannot parse ${relativePath}`,
    );
  }
  return kind;
}

// typescript collects syntactic diagnostics on the source file while parsing but
// does not declare the field publicly; the test over a file that does not parse
// is what keeps this access honest.
type SourceFileWithParseDiagnostics = ts.SourceFile & {
  readonly parseDiagnostics?: readonly ts.Diagnostic[];
};

function syntacticDiagnostics(sourceFile: ts.SourceFile): readonly ts.Diagnostic[] {
  return (sourceFile as SourceFileWithParseDiagnostics).parseDiagnostics ?? [];
}

export function parseSource(relativePath: string, text: string): ParsedFile {
  const sourceFile = ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.ESNext,
    true,
    scriptKindFor(relativePath),
  );
  return { path: relativePath, sourceFile, diagnostics: syntacticDiagnostics(sourceFile) };
}

// A symbol selector names a declaration, not a call site: the name the caller
// typed must be the declared one. A function declaration and a method share the
// "function" kind because both are functions of the file; a class is the class
// declaration itself.
export type SymbolKind = "function" | "class";

export type SymbolDeclaration = {
  readonly kind: SymbolKind;
  readonly name: string;
  readonly start_line: number;
};

type NamedDeclaration =
  | ts.FunctionDeclaration
  | ts.ClassDeclaration
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;

function isNamedDeclaration(node: ts.Node): node is NamedDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

// An overload set is several declarations of one name, and so is the same method
// name in two classes: the list keeps them apart so the selector can refuse to
// choose by proximity instead of collapsing them.
export function declarationsOf(parsed: ParsedFile): readonly SymbolDeclaration[] {
  const declarations: SymbolDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (isNamedDeclaration(node)) {
      const name = node.name?.getText(parsed.sourceFile);
      if (name !== undefined) {
        declarations.push({
          kind: ts.isClassDeclaration(node) ? "class" : "function",
          name,
          start_line:
            parsed.sourceFile.getLineAndCharacterOfPosition(node.getStart(parsed.sourceFile)).line +
            1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return declarations;
}

export function resolveSymbol(
  parsed: ParsedFile,
  kind: SymbolKind,
  name: string,
): readonly SymbolDeclaration[] {
  return declarationsOf(parsed).filter(
    (declaration) => declaration.kind === kind && declaration.name === name,
  );
}
