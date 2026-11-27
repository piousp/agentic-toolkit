import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import type { TestContext } from "node:test";

import { parseSource } from "../src/parse.ts";
import type { RulesetRule } from "../src/rulesets.ts";
import { transformFile } from "../src/transform.ts";
import type { TransformDeps } from "../src/transform.ts";
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
  const result = transformFile(parseSource("ticket.ts", SOURCE), [STATUS_RULE], FREE_DESTINATIONS);

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
  const result = transformFile(
    parseSource("ticket.ts", CRLF_SOURCE),
    [STATUS_RULE],
    FREE_DESTINATIONS,
  );

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
      () => transformFile(parseSource("ticket.ts", SOURCE), rules, FREE_DESTINATIONS),
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
  const result = transformFile(
    parseSource("ticket.ts", NO_MATCH_SOURCE),
    [STATUS_RULE],
    FREE_DESTINATIONS,
  );

  assert.deepEqual(result.edits, []);
  assert.equal(result.text, NO_MATCH_SOURCE);
});

// D7: `extract-module` moves one top-level value declaration into its own module and
// leaves the origin re-exporting it, so every module that imports the origin keeps
// working and none of them is rewritten. This is `extract-helper` of
// rulesets/extract.yaml, held here as a literal so the case pins the published words.
const EXTRACT_HELPER_RULE: RulesetRule = {
  id: "extract-helper",
  kind: "extract-module",
  description:
    "Move one top-level value declaration into its own module, re-exported by the origin.",
  match: { declarations: ["parseTicket"] },
  params: { target: "./ticket-parse" },
};

// The destination probe is the file-system boundary the entry builds from its
// workspace; over a tree whose destination is free it answers no.
const FREE_DESTINATIONS: TransformDeps = { targetExists: () => false };

const HELPER_SOURCE = `export function parseTicket(line: string): string[] {
  return line.split("|");
}

export function renderTicket(fields: string[]): string {
  return fields.join("|");
}
`;

// The origin keeps every other byte and the re-export takes the declaration's place,
// so the name stays importable from the module the caller already names.
const HELPER_ORIGIN = `export { parseTicket } from "./ticket-parse";

export function renderTicket(fields: string[]): string {
  return fields.join("|");
}
`;

// The destination carries the declaration itself, exported, because a re-export of a
// name the destination does not export would not compile.
const HELPER_MODULE = `export function parseTicket(line: string): string[] {
  return line.split("|");
}
`;

it("moves a top-level value declaration into its own module and re-exports it from the origin", () => {
  const result = transformFile(
    parseSource("ticket.ts", HELPER_SOURCE),
    [EXTRACT_HELPER_RULE],
    FREE_DESTINATIONS,
  );

  assert.equal(result.text, HELPER_ORIGIN);
  assert.deepEqual(result.modules, [
    { rule: "extract-helper", path: "ticket-parse.ts", text: HELPER_MODULE },
  ]);
});

// The tree the caller measures holds files the rule did not write. The probe below
// answers from a temporary root, which is the answer the entry builds from its
// workspace: no destination is guessed to be free.
async function makeRoot(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "refactor-report-transform-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(
    Object.entries(files).map(([relative, text]) =>
      writeFile(path.join(root, relative), text, "utf8"),
    ),
  );
  return root;
}

function probeOf(root: string): TransformDeps {
  return { targetExists: (relativePath) => existsSync(path.join(root, relativePath)) };
}

// The file the caller already has at the destination is never a file this server gets
// to replace, and the transform fails before it produces a single edit.
const EXISTING_DESTINATION = `export function parseTicket(line: string): string[] {
  return line.split(";");
}
`;

it("refuses to move a declaration into a module the tree already holds", async (t) => {
  const root = await makeRoot(t, {
    "ticket.ts": HELPER_SOURCE,
    "ticket-parse.ts": EXISTING_DESTINATION,
  });

  assert.throws(
    () => transformFile(parseSource("ticket.ts", HELPER_SOURCE), [EXTRACT_HELPER_RULE], probeOf(root)),
    (error: WorkspaceError) => {
      assert.equal(error.code, "TARGET_EXISTS");
      assert.equal(
        error.message.includes("ticket-parse.ts"),
        true,
        "the detail names the destination the caller has to move out of the way",
      );
      return true;
    },
  );
  assert.equal(readFileSync(path.join(root, "ticket-parse.ts"), "utf8"), EXISTING_DESTINATION);
  assert.equal(readFileSync(path.join(root, "ticket.ts"), "utf8"), HELPER_SOURCE);
});

// D5: two rules of the same kind naming the same declaration would place two
// re-exports over one range. Neither rule is more specific than the other, so the
// pair is refused and the outcome never depends on the order the ruleset lists them.
const ELSEWHERE_HELPER_RULE: RulesetRule = {
  ...EXTRACT_HELPER_RULE,
  id: "extract-helper-elsewhere",
  params: { target: "./ticket-parse-elsewhere" },
};

it("refuses two rules of the same kind that re-export over the same range, in either order", () => {
  for (const rules of [
    [EXTRACT_HELPER_RULE, ELSEWHERE_HELPER_RULE],
    [ELSEWHERE_HELPER_RULE, EXTRACT_HELPER_RULE],
  ]) {
    assert.throws(
      () => transformFile(parseSource("ticket.ts", HELPER_SOURCE), rules, FREE_DESTINATIONS),
      (error: WorkspaceError) => {
        assert.equal(error.code, "EDIT_CONFLICT");
        assert.equal(error.message.includes("extract-helper-elsewhere"), true);
        assert.equal(error.message.includes("extract-helper "), true);
        return true;
      },
    );
  }
});

// D7: v1 moves value declarations only. A rule that names a type declaration is
// refused by name, because an empty edit list would report the caller's rule as
// applied while the declaration stayed where it was.
const TYPED_SOURCE = `export type parseTicket = (line: string) => string[];

export function renderTicket(fields: string[]): string {
  return fields.join("|");
}
`;

it("refuses to move a type declaration and names the line that holds it", () => {
  assert.throws(
    () =>
      transformFile(parseSource("ticket.ts", TYPED_SOURCE), [EXTRACT_HELPER_RULE], FREE_DESTINATIONS),
    (error: WorkspaceError) => {
      assert.equal(error.code, "SYMBOL_NOT_FOUND");
      assert.deepEqual(error.paths, ["ticket.ts:1"]);
      assert.equal(error.message.includes("parseTicket"), true);
      return true;
    },
  );
});
