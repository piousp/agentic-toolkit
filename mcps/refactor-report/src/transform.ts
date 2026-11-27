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
  readonly text: string;
};

export type Transform = (parsed: ParsedFile, rule: RulesetRule) => readonly TextEdit[];

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
export function extractConst(parsed: ParsedFile, rule: RulesetRule): readonly TextEdit[] {
  const value = matchedValueOf(rule);
  const name = constNameOf(rule);
  const literals = literalsValued(parsed.sourceFile, value);
  const first = literals[0];
  if (first === undefined) {
    return [];
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
  return edits;
}

// D6: the registry is closed. A kind is a key of this map and nothing else, and
// `RulesetKind` is the one enum both the ruleset loader and this module read.
export const TRANSFORM_REGISTRY: ReadonlyMap<RulesetKind, Transform> = new Map([
  ["extract-const", extractConst],
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
): TransformOutcome {
  const edits: TextEdit[] = [];
  for (const rule of rules) {
    edits.push(...transformFor(rule.kind)(parsed, rule));
  }
  return { edits, text: applyEdits(parsed.sourceFile.getFullText(), edits) };
}
