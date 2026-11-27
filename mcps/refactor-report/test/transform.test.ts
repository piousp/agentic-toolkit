import assert from "node:assert/strict";
import { it } from "node:test";

import { parseSource } from "../src/parse.ts";
import type { RulesetRule } from "../src/rulesets.ts";
import { transformFile } from "../src/transform.ts";
import type { WorkspaceError } from "../src/workspace.ts";

// D6: the rule is data. This is `http-status-const` of rulesets/extract.yaml, held
// here as a literal so the case pins the words the published YAML spells.
const STATUS_RULE: RulesetRule = {
  id: "http-status-const",
  kind: "extract-const",
  description: "Hoist one matched string literal into a module-level const.",
  match: { literal: "string", value: "200" },
  params: { name: "STATUS_OK" },
};

const SOURCE = `const ticket = await client.get("/tickets");

export function accepted(ticket: Ticket): boolean {
  return ticket.status === "200";
}
`;

// The const carries the literal the source already spelled and the reference takes
// its place; the specifier of the request is not the matched value, so it stays.
const EXPECTED = `const STATUS_OK = "200";

const ticket = await client.get("/tickets");

export function accepted(ticket: Ticket): boolean {
  return ticket.status === STATUS_OK;
}
`;

// R5/R6: a transform reports edits against the original text, and the module-level
// const is the shape the published `extract-const` rule declares.
it("hoists a matched string literal into a module-level const and replaces the literal with its name", () => {
  const result = transformFile(parseSource("ticket.ts", SOURCE), [STATUS_RULE]);

  assert.equal(result.text, EXPECTED);
});

// A header comment block, a blank line, doubled spaces and CRLF line endings: the
// bytes no edit covers are copied as they were, so the file is never reformatted.
const CRLF_SOURCE =
  "// SPDX-License-Identifier: MIT\r\n" +
  "// Text outside the edits is copied, never re-rendered.\r\n" +
  "\r\n" +
  'const   ticket = await client.get( "/tickets" );   // spacing is deliberate\r\n' +
  'if (ticket.status === "200") { return ticket; }\r\n';

const CRLF_EXPECTED =
  "// SPDX-License-Identifier: MIT\r\n" +
  "// Text outside the edits is copied, never re-rendered.\r\n" +
  "\r\n" +
  'const STATUS_OK = "200";\r\n' +
  "\r\n" +
  'const   ticket = await client.get( "/tickets" );   // spacing is deliberate\r\n' +
  'if (ticket.status === STATUS_OK) { return ticket; }\r\n';

// R5: the report is a set of ranges of the text the caller holds, so what lies
// outside them keeps its bytes: the header stays first and CRLF stays CRLF.
it("copies every byte outside the edited ranges, header and line endings included", () => {
  const result = transformFile(parseSource("ticket.ts", CRLF_SOURCE), [STATUS_RULE]);

  assert.ok(
    result.text.startsWith("// SPDX-License-Identifier: MIT\r\n"),
    "the hoisted const belongs after the file header, never in front of it",
  );
  assert.equal(result.text, CRLF_EXPECTED);
});

// D6: a second rule of the same kind naming another const over the same value. Both
// ask for the same literal range, so the pair is a conflict and not a precedence.
const SECOND_NAME_RULE: RulesetRule = {
  ...STATUS_RULE,
  id: "http-status-const-again",
  params: { name: "OK" },
};

// D5: overlap is refused instead of resolved. Reversing the two rules cannot change
// the outcome, which is what keeps a preview independent of the order a ruleset
// happens to list its rules in.
it("refuses two rules whose edits overlap, in either order, instead of letting the order decide", () => {
  for (const rules of [
    [STATUS_RULE, SECOND_NAME_RULE],
    [SECOND_NAME_RULE, STATUS_RULE],
  ]) {
    assert.throws(
      () => transformFile(parseSource("ticket.ts", SOURCE), rules),
      (error: WorkspaceError) => {
        assert.equal(error.code, "EDIT_CONFLICT");
        assert.equal(error.message.includes("http-status-const"), true);
        assert.equal(error.message.includes("http-status-const-again"), true);
        return true;
      },
    );
  }
});

// D12: a rule that matches nothing is a successful answer with no work in it, never
// an error and never a reformat of the text that carried no match.
const NO_MATCH_SOURCE = `const ticket = await client.get("/tickets");

export function missing(ticket: Ticket): boolean {
  return ticket.status === "404";
}
`;

it("returns zero edits and the same text when no literal carries the matched value", () => {
  const result = transformFile(parseSource("ticket.ts", NO_MATCH_SOURCE), [STATUS_RULE]);

  assert.deepEqual(result.edits, []);
  assert.equal(result.text, NO_MATCH_SOURCE);
});
