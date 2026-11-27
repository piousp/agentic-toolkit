import path from "node:path";

import ts from "typescript";

import type { ParsedFile } from "./parse.ts";
import { RULESET_KINDS } from "./rulesets.ts";
import type { RulesetKind, RulesetRule } from "./rulesets.ts";
import { WorkspaceError } from "./workspace.ts";

// D5: one edit is a range of the original text plus the bytes that replace it, and
// every edit traces back to the rule that asked for it.
export type TextEdit = {
  readonly rule: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

export type TransformOutcome = {
  readonly edits: readonly TextEdit[];
  readonly modules: readonly ModuleCreation[];
  readonly text: string;
};

// D7: a module this rule would create beside the origin. Its bytes are not a range of
// the origin text, so they travel next to the edits instead of inside them.
export type ModuleCreation = {
  readonly rule: string;
  readonly path: string;
  readonly text: string;
};

// D7: the destination is a file of the measured tree and only the entry knows that
// tree, so the existence of the destination is a dependency and never a read of this
// module's own. A probe that answers no for a tree with nothing in it is how the unit
// cases call the transform.
export type TransformDeps = {
  readonly targetExists: (relativePath: string) => boolean;
};

export type TransformResult = {
  readonly edits: readonly TextEdit[];
  readonly modules: readonly ModuleCreation[];
};

export type Transform = (
  parsed: ParsedFile,
  rule: RulesetRule,
  deps: TransformDeps,
) => TransformResult;

function stringOf(
  record: Readonly<Record<string, unknown>>,
  key: string,
  rule: RulesetRule,
  where: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value === "") {
    throw new WorkspaceError(
      "RULESET_INVALID",
      `${rule.id}: ${where} ${key} is not a non-empty string, and a rule this server cannot read is never skipped`,
    );
  }
  return value;
}

// R6: `match` names the construction to lift and the value it must carry; a rule
// whose matcher this server cannot read is refused instead of matching nothing.
function matchedValueOf(rule: RulesetRule): string {
  if (rule.match.literal !== "string") {
    throw new WorkspaceError(
      "RULESET_INVALID",
      `${rule.id}: kind ${rule.kind} lifts string literals; match.literal is ${String(rule.match.literal)}`,
    );
  }
  return stringOf(rule.match, "value", rule, "match.");
}

function constNameOf(rule: RulesetRule): string {
  return stringOf(rule.params, "name", rule, "params.");
}

// The literal is taken from the text the source already spells, so the hoisted const
// keeps the quoting the file uses instead of a normalised form of it.
function literalsValued(root: ts.SourceFile, value: string): readonly ts.StringLiteral[] {
  const literals: ts.StringLiteral[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) && node.text === value) {
      literals.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return literals;
}

// D5: the hoisted const belongs where the module's first statement starts, so a
// leading comment block keeps the first bytes of the file. An empty module starts at
// zero. The break is the one the text already uses, so a CRLF module stays CRLF.
function insertionPointOf(sourceFile: ts.SourceFile): number {
  const first = sourceFile.statements[0];
  return first === undefined ? 0 : first.getStart(sourceFile);
}

function lineBreakOf(text: string): string {
  const at = text.indexOf("\n");
  return at > 0 && text[at - 1] === "\r" ? "\r\n" : "\n";
}

// R5/R6: `extract-const` lifts every literal carrying the matched value into one
// module-level const and leaves a reference in each place. Both halves are ranges of
// the original text, so nothing outside them is rewritten.
export function extractConst(parsed: ParsedFile, rule: RulesetRule): TransformResult {
  const value = matchedValueOf(rule);
  const name = constNameOf(rule);
  const literals = literalsValued(parsed.sourceFile, value);
  const first = literals[0];
  if (first === undefined) {
    return { edits: [], modules: [] };
  }

  const lineBreak = lineBreakOf(parsed.sourceFile.getFullText());
  const declaration = `const ${name} = ${first.getText(parsed.sourceFile)};${lineBreak}${lineBreak}`;
  const insertionPoint = insertionPointOf(parsed.sourceFile);
  const edits: TextEdit[] = [
    { rule: rule.id, start: insertionPoint, end: insertionPoint, text: declaration },
  ];
  for (const literal of literals) {
    edits.push({
      rule: rule.id,
      start: literal.getStart(parsed.sourceFile),
      end: literal.getEnd(),
      text: name,
    });
  }
  return { edits, modules: [] };
}

// R7/D7: the destination is written with the extension the origin already uses unless
// the rule spells one, so a .tsx origin never lands its JSX in a .ts module.
const MODULE_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".tsx", ".mts", ".cts"]);

function destinationOf(originPath: string, target: string): string {
  const directory = path.posix.dirname(originPath);
  const spelled = path.posix.extname(target);
  const extension = MODULE_EXTENSIONS.has(spelled)
    ? ""
    : MODULE_EXTENSIONS.has(path.posix.extname(originPath))
      ? path.posix.extname(originPath)
      : ".ts";
  return path.posix.normalize(path.posix.join(directory, `${target}${extension}`));
}

// D7: a movable unit is a top-level declaration of a value, named once. A variable
// statement that declares several names is not moved by a rule that can only name one
// of them, and a statement that declares no name is not a unit at all.
function valueDeclarationOf(node: ts.Statement): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name?.text;
  }
  if (ts.isVariableStatement(node)) {
    const declarations = node.declarationList.declarations;
    const name = declarations.length === 1 ? declarations[0]?.name : undefined;
    return name !== undefined && ts.isIdentifier(name) ? name.text : undefined;
  }
  return undefined;
}

function typeDeclarationOf(node: ts.Statement): string | undefined {
  return ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)
    ? node.name.text
    : undefined;
}

function lineOf(parsed: ParsedFile, node: ts.Node): number {
  return (
    parsed.sourceFile.getLineAndCharacterOfPosition(node.getStart(parsed.sourceFile)).line + 1
  );
}

function movedNamesOf(rule: RulesetRule): readonly string[] {
  const declarations = rule.match.declarations;
  const names = Array.isArray(declarations) ? declarations : [];
  if (names.length === 0 || !names.every((name) => typeof name === "string" && name !== "")) {
    throw new WorkspaceError(
      "RULESET_INVALID",
      `${rule.id}: kind extract-module moves the top-level declarations match.declarations names, and it carries ${JSON.stringify(declarations)}`,
    );
  }
  return names as readonly string[];
}

// The destination has to export what the origin re-exports: a declaration that already
// carried the modifier keeps it, and one the origin kept private gains one.
function exportedText(parsed: ParsedFile, statement: ts.Statement): string {
  const text = statement.getText(parsed.sourceFile);
  return text.startsWith("export ") ? text : `export ${text}`;
}

// D7: `extract-module` moves the named top-level value declarations into their own
// module and leaves the origin re-exporting them from the first range it gave up, so
// every module that imports the origin keeps resolving and none of them is rewritten.
// A type is excluded in v1 and refused by name instead of reported as an empty edit.
export function extractModule(
  parsed: ParsedFile,
  rule: RulesetRule,
  deps: TransformDeps,
): TransformResult {
  const names = movedNamesOf(rule);
  const target = stringOf(rule.params, "target", rule, "params.");
  const destination = destinationOf(parsed.path, target);
  if (deps.targetExists(destination)) {
    throw new WorkspaceError(
      "TARGET_EXISTS",
      `${rule.id} moves ${names.join(", ")} to ${destination}, which is already in the tree: an existing module is never overwritten`,
    );
  }

  const claimed: ts.Statement[] = [];
  const exported: string[] = [];
  for (const name of names) {
    const value = parsed.sourceFile.statements.find(
      (node) => valueDeclarationOf(node) === name,
    );
    if (value !== undefined) {
      claimed.push(value);
      exported.push(name);
      continue;
    }
    const type = parsed.sourceFile.statements.find(
      (node) => typeDeclarationOf(node) === name,
    );
    if (type !== undefined) {
      throw new WorkspaceError(
        "SYMBOL_NOT_FOUND",
        `${rule.id} names ${name}, and ${parsed.path} declares it as a type: v1 moves top-level value declarations only, and a declaration this server cannot move is never reported as an empty edit`,
        [`${parsed.path}:${lineOf(parsed, type)}`],
      );
    }
  }
  if (claimed.length === 0) {
    return { edits: [], modules: [] };
  }

  const ordered = [...claimed].sort(
    (left, right) => left.getStart(parsed.sourceFile) - right.getStart(parsed.sourceFile),
  );
  const lineBreak = lineBreakOf(parsed.sourceFile.getFullText());
  const reExport = `export { ${exported.join(", ")} } from ${JSON.stringify(target)};`;
  const edits: TextEdit[] = ordered.map((statement, index) => ({
    rule: rule.id,
    start: statement.getStart(parsed.sourceFile),
    end: statement.getEnd(),
    text: index === 0 ? reExport : "",
  }));
  const moved = ordered.map((statement) => `${exportedText(parsed, statement)}${lineBreak}`);

  return {
    edits,
    modules: [{ rule: rule.id, path: destination, text: moved.join(lineBreak) }],
  };
}

// D6: the registry is closed. A kind is a key of this map and nothing else, and
// `RulesetKind` is the one enum both the ruleset loader and this module read.
export const TRANSFORM_REGISTRY: ReadonlyMap<RulesetKind, Transform> = new Map([
  ["extract-const", extractConst],
  ["extract-module", extractModule],
]);

export function transformFor(kind: RulesetKind): Transform {
  const transform = TRANSFORM_REGISTRY.get(kind);
  if (transform === undefined) {
    const missing = RULESET_KINDS.filter((candidate) => !TRANSFORM_REGISTRY.has(candidate));
    throw new WorkspaceError(
      "RULESET_INVALID",
      `kind ${kind} has no transform in this build; ${missing.join(", ")} is declared by the closed registry and not implemented yet, and a kind this build cannot run is never skipped`,
    );
  }
  return transform;
}

// D5: two edits of one text can never both claim the same bytes, and a zero-length
// insertion is ambiguous with another one at the same offset or with a range it sits
// inside. Overlap is refused instead of resolved, so the result never depends on the
// order the rules happen to sit in.
function overlaps(left: TextEdit, right: TextEdit): boolean {
  const leftInserts = left.start === left.end;
  const rightInserts = right.start === right.end;
  if (leftInserts && rightInserts) {
    return left.start === right.start;
  }
  if (leftInserts) {
    return right.start < left.start && left.start < right.end;
  }
  if (rightInserts) {
    return left.start < right.start && right.start < left.end;
  }
  return left.start < right.end && right.start < left.end;
}

function assertNoOverlap(ordered: readonly TextEdit[]): void {
  for (let at = 1; at < ordered.length; at += 1) {
    const left = ordered[at - 1];
    const right = ordered[at];
    if (left !== undefined && right !== undefined && overlaps(left, right)) {
      throw new WorkspaceError(
        "EDIT_CONFLICT",
        `${left.rule} edits ${left.start}..${left.end} and ${right.rule} edits ${right.start}..${right.end}: overlapping edits are refused, never resolved by the order the rules carry`,
      );
    }
  }
}

// D5: the edits are ranges of one text, so applying them is ordered splicing and
// never a re-render: every byte outside a range is copied unchanged.
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const ordered = [...edits].sort((left, right) => left.start - right.start || left.end - right.end);
  assertNoOverlap(ordered);
  let applied = "";
  let at = 0;
  for (const edit of ordered) {
    applied += text.slice(at, edit.start) + edit.text;
    at = edit.end;
  }
  return applied + text.slice(at);
}

export function transformFile(
  parsed: ParsedFile,
  rules: readonly RulesetRule[],
  deps: TransformDeps,
): TransformOutcome {
  const edits: TextEdit[] = [];
  const modules: ModuleCreation[] = [];
  for (const rule of rules) {
    const result = transformFor(rule.kind)(parsed, rule, deps);
    edits.push(...result.edits);
    modules.push(...result.modules);
  }
  return { edits, modules, text: applyEdits(parsed.sourceFile.getFullText(), edits) };
}
