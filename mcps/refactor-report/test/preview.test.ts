import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import type { TestContext } from "node:test";

import { runPreview } from "../src/preview.ts";
import { openWorkspace } from "../src/workspace.ts";
import type { WorkspaceError } from "../src/workspace.ts";

// sha256sum rulesets/extract.yaml, computed with sha256sum from the published bytes
// and never printed by the implementation: the recipe names the ruleset by the
// prefix of its content digest, which is what R6 puts in front of every run.
const EXTRACT_DIGEST = "72e6628994f02c10ddd1ea11d28f77c64cfb13e783e33a0cfb6ff7852a91dd9d";

const RECIPE = `extract.yaml#sha256:${EXTRACT_DIGEST.slice(0, 12)}`;

// The tree every case previews is a temporary root, so no case touches the sources
// of this package and no path of this machine is written down.
async function makeRoot(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "refactor-report-preview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(
    Object.entries(files).map(async ([relative, text]) => {
      const absolute = path.join(root, relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, text, "utf8");
    }),
  );
  return root;
}

const TICKET_SOURCE = `export function accepted(ticket: Ticket): boolean {
  return ticket.status === "200";
}
`;

// R5/R8: a preview reports what a recipe would do to the tree and does none of it.
// `applied: false` is the field the caller reads, and the bytes of the tree are the
// evidence behind it: the answer is rendered from an in-memory text, never written.
it("answers applied false, renders the edits a recipe would make, and leaves the tree byte-identical", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": TICKET_SOURCE });
  const workspace = await openWorkspace(root);

  const answer = await runPreview(
    {
      recipe: { ruleset: RECIPE, rules: ["http-status-const"] },
      paths: ["src/ticket.ts"],
    },
    { workspace },
  );

  assert.equal(answer.verb, "preview");
  assert.equal(answer.applied, false);
  assert.deepEqual(answer.paths, ["src/ticket.ts"]);

  const [file] = answer.files;
  assert.ok(file !== undefined);
  assert.equal(file.path, "src/ticket.ts");
  assert.equal(file.status, "modified");
  assert.ok(
    file.diff.includes('+const STATUS_OK = "200";'),
    `the rendered diff does not carry the hoisted const:\n${file.diff}`,
  );
  assert.ok(
    file.diff.includes('-  return ticket.status === "200";'),
    `the rendered diff does not carry the replaced literal:\n${file.diff}`,
  );
  assert.ok(
    file.diff.includes("+  return ticket.status === STATUS_OK;"),
    `the rendered diff does not carry the reference:\n${file.diff}`,
  );
  assert.ok(file.ranges.length > 0, "the answer names no touched range");

  assert.deepEqual(await workspace.listFiles(), ["src/ticket.ts"]);
  assert.equal(await readFile(path.join(root, "src/ticket.ts"), "utf8"), TICKET_SOURCE);
});

// R5: `change_digest` is the name of a change, so two runs over the same tree carry
// the same name and a tree that differs by one character does not. The case pins the
// stability a caller compares against and the sensitivity that makes it worth
// comparing, and reads both from runs of the service.
it("names the same change with the same digest twice and another change with another digest", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": TICKET_SOURCE });
  const workspace = await openWorkspace(root);
  const request = {
    recipe: { ruleset: RECIPE, rules: ["http-status-const"] },
    paths: ["src/ticket.ts"],
  };

  const first = await runPreview(request, { workspace });
  const second = await runPreview(request, { workspace });

  assert.match(first.change_digest, /^[0-9a-f]{64}$/);
  assert.equal(
    second.change_digest,
    first.change_digest,
    "two runs over the same tree named two different changes",
  );

  // One character more at the head of the file: a blank line, which moves every
  // line the recipe touches one line down.
  await writeFile(path.join(root, "src/ticket.ts"), `\n${TICKET_SOURCE}`, "utf8");
  const shifted = await runPreview(request, { workspace });

  assert.ok(shifted.paths.length > 0, "the shifted tree carried no change to name");
  assert.notEqual(
    shifted.change_digest,
    first.change_digest,
    "a tree one character longer carried the digest of the tree it grew from",
  );
});

// D7: `extract-module` moves a declaration out of the origin and into a module of
// its own, so one run reports both signs of the same delta: the origin loses the
// lines the declaration held and the module the recipe would create gains them.
const HELPER_SOURCE = `export function parseTicket(line: string): string[] {
  return line.split("|");
}

export function renderTicket(fields: string[]): string {
  return fields.join("|");
}
`;

it("reports the delta of one change in both directions and the created module as a file", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": HELPER_SOURCE });
  const workspace = await openWorkspace(root);

  const answer = await runPreview(
    { recipe: { ruleset: RECIPE, rules: ["extract-helper"] }, paths: ["src/ticket.ts"] },
    { workspace },
  );

  assert.deepEqual(answer.paths, ["src/ticket.ts", "src/ticket-parse.ts"]);
  const [origin, created] = answer.files;
  assert.ok(origin !== undefined, "the answer does not report the origin");
  assert.ok(created !== undefined, "the answer does not report the module the recipe creates");

  // Seven lines became five: the declaration left, its re-export took its place,
  // and the blank line of the origin went with the declaration.
  assert.equal(origin.path, "src/ticket.ts");
  assert.equal(origin.status, "modified");
  assert.deepEqual(origin.delta, {
    loc: -2,
    functions: -1,
    max_complexity: 0,
    importers: 0,
  });

  // The created module is not on disk, so its delta is read against the empty text
  // it holds now, and the re-export of the origin is its one importer.
  assert.equal(created.path, "src/ticket-parse.ts");
  assert.equal(created.status, "created");
  assert.deepEqual(created.delta, {
    loc: 3,
    functions: 1,
    max_complexity: 1,
    importers: 1,
  });

  assert.deepEqual(await workspace.listFiles(), ["src/ticket.ts"]);
});

// D12: a recipe that matches nothing is a successful answer with nothing in it. The
// caller asked what the rules would change and the honest answer is that they change
// nothing here: no path, no file entry, and no error the caller has to read.
const NO_MATCH_SOURCE = `export function missing(ticket: Ticket): boolean {
  return ticket.status === "404";
}
`;

it("answers an empty report, not an error, when the recipe matches nothing", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": NO_MATCH_SOURCE });
  const workspace = await openWorkspace(root);
  const request = {
    recipe: { ruleset: RECIPE, rules: ["http-status-const"] },
    paths: ["src/ticket.ts"],
  };

  const answer = await runPreview(request, { workspace });

  assert.equal(answer.applied, false);
  assert.deepEqual(answer.paths, []);
  assert.deepEqual(answer.files, []);
  assert.match(answer.change_digest, /^[0-9a-f]{64}$/);
  assert.equal(await readFile(path.join(root, "src/ticket.ts"), "utf8"), NO_MATCH_SOURCE);

  // The empty change has one name, so a caller compares two empty runs without
  // knowing which rules matched in either of them.
  const again = await runPreview(request, { workspace });
  assert.equal(again.change_digest, answer.change_digest);
});

// R5: the ceiling fails closed. A rendering above it is refused with its own code
// instead of cut, because a caller who receives half a diff reads it as the whole
// change, and the value it is measured against is the rendering a reader receives.
it("refuses a rendering above the diff ceiling instead of cutting it", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": TICKET_SOURCE });
  const workspace = await openWorkspace(root);

  await assert.rejects(
    () =>
      runPreview(
        {
          recipe: { ruleset: RECIPE, rules: ["http-status-const"] },
          paths: ["src/ticket.ts"],
        },
        { workspace, maxDiffLines: 1 },
      ),
    (error: WorkspaceError) => {
      assert.equal(error.code, "PREVIEW_OVER_LIMIT");
      return true;
    },
  );

  assert.equal(await readFile(path.join(root, "src/ticket.ts"), "utf8"), TICKET_SOURCE);
});
