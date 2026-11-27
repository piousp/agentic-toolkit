import assert from "node:assert/strict";
import { it } from "node:test";

import ts from "typescript";

import { parseSource, scriptKindFor } from "../src/parse.ts";
import { WorkspaceError } from "../src/workspace.ts";

// These cases are declared regressions, not a red-then-green cycle: the
// implementation they pin was written before them, so they pass on their first
// run by design. They exist because `src/parse.ts` reads `parseDiagnostics`
// through a cast the public typings do not declare: without them, a change in
// that field would leave the server reporting zero diagnostics in silence.

it("parses a well-formed file and reports no syntactic diagnostic", () => {
  const parsed = parseSource("sample.ts", "export const answer = 42;\n");

  assert.equal(parsed.path, "sample.ts");
  assert.equal(parsed.diagnostics.length, 0);
  assert.equal(parsed.sourceFile.statements.length, 1);
});

it("reports a syntactic diagnostic instead of throwing on a file that does not parse", () => {
  const parsed = parseSource("broken.ts", "export const answer = ;\n");

  assert.ok(
    parsed.diagnostics.length >= 1,
    "a file that does not parse carries at least one diagnostic",
  );
  assert.equal(typeof parsed.diagnostics[0]?.start, "number");

  const text = parsed.sourceFile.getFullText();
  assert.equal(text, "export const answer = ;\n");
});

it("keeps the AST of a broken file readable up to the failure point", () => {
  const parsed = parseSource("broken.ts", "export const answer = ;\n");

  const declaration = parsed.sourceFile.statements.at(0);
  assert.ok(declaration !== undefined, "the statement is recovered as a node");
  assert.ok(ts.isVariableStatement(declaration));
});

it("reads the script kind from the extension and refuses the rest", () => {
  assert.equal(scriptKindFor("a.ts"), ts.ScriptKind.TS);
  assert.equal(scriptKindFor("a.mts"), ts.ScriptKind.TS);
  assert.equal(scriptKindFor("a.cts"), ts.ScriptKind.TS);
  assert.equal(scriptKindFor("a.tsx"), ts.ScriptKind.TSX);

  for (const unsupported of ["a.js", "a.jsx", "a.md", "a"]) {
    assert.throws(
      () => scriptKindFor(unsupported),
      (error: unknown) =>
        error instanceof WorkspaceError && error.code === "LANGUAGE_UNSUPPORTED",
      `${unsupported} is refused`,
    );
  }
});
