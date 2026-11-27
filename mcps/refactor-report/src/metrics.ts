import ts from "typescript";

import { parseSource } from "./parse.ts";

export type ComplexityUnit = {
  readonly name: string;
  readonly start_line: number;
  readonly complexity: number;
};

export type MaxComplexity = {
  readonly value: number;
  readonly unit: string | null;
  readonly start_line: number | null;
};

export type FileMetrics = {
  readonly path: string;
  readonly loc: number;
  readonly functions: number;
  readonly max_complexity: MaxComplexity;
  readonly units: readonly ComplexityUnit[];
};

type NamedUnit = ts.FunctionLikeDeclaration & { readonly name?: ts.Node };

function isUnitNode(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function unitName(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }
  const named = node as NamedUnit;
  return named.name?.getText(sourceFile) ?? "(anonymous)";
}

function startLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

// R3: complexity is one plus the decision points inside the unit. A nested unit
// is skipped here because it is measured on its own line of the same report.
// A short-circuit or nullish operator is a branch each time it appears, so
// `a && b && c` is two decision points.
const LOGICAL_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

// `?.` is a branch at each of its three sites: property access, element access
// and call. An optional marker in a declaration (`value?: string`) is typed, not
// optional chaining, and is not counted.
function isOptionalChain(node: ts.Node): boolean {
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isCallExpression(node)
  ) {
    return node.questionDotToken !== undefined;
  }
  return false;
}

// Every loop repeats a body, so each one is a decision point: `for`, `for…of`,
// `for…in`, `while` and `do…while`.
function isLoop(node: ts.Node): boolean {
  return (
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  );
}

function isDecisionPoint(node: ts.Node): boolean {
  if (ts.isBinaryExpression(node)) {
    return LOGICAL_OPERATORS.has(node.operatorToken.kind);
  }
  return (
    ts.isIfStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node) ||
    isOptionalChain(node) ||
    isLoop(node)
  );
}

function decisionPoints(unit: ts.Node): number {
  let count = 0;
  const walk = (node: ts.Node): void => {
    ts.forEachChild(node, (child) => {
      if (isUnitNode(child)) {
        return;
      }
      if (isDecisionPoint(child)) {
        count += 1;
      }
      walk(child);
    });
  };
  walk(unit);
  return count;
}

function complexityOf(unit: ts.Node): number {
  return 1 + decisionPoints(unit);
}

function collectUnits(sourceFile: ts.SourceFile): ComplexityUnit[] {
  const units: ComplexityUnit[] = [];
  const visit = (node: ts.Node): void => {
    if (isUnitNode(node)) {
      units.push({
        name: unitName(node, sourceFile),
        start_line: startLine(node, sourceFile),
        complexity: complexityOf(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return units;
}

// R3 counts the lines of the file: CRLF is normalised, and the final newline of a
// file does not open one more line.
function countLines(text: string): number {
  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized === "") {
    return 0;
  }
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length;
}

// R3 asks for the most complex unit, so the reported value carries the unit name
// and the line the unit starts on. On a tie the first unit in source order wins.
// A file with no unit has no maximum, reported as an empty one.
function maxComplexityOf(units: readonly ComplexityUnit[]): MaxComplexity {
  let best: ComplexityUnit | undefined;
  for (const unit of units) {
    if (best === undefined || unit.complexity > best.complexity) {
      best = unit;
    }
  }
  if (best === undefined) {
    return { value: 0, unit: null, start_line: null };
  }
  return { value: best.complexity, unit: best.name, start_line: best.start_line };
}

export function measureFile(relativePath: string, text: string): FileMetrics {
  const { sourceFile } = parseSource(relativePath, text);
  const units = collectUnits(sourceFile);

  return {
    path: relativePath,
    loc: countLines(text),
    functions: units.length,
    max_complexity: maxComplexityOf(units),
    units,
  };
}
