import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import type { TestContext } from "node:test";

import { openWorkspace } from "../src/workspace.ts";
import type { WorkspaceError } from "../src/workspace.ts";

async function makeRoot(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "refactor-report-ws-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, text] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, text, "utf8");
  }
  return root;
}

it("reads a TypeScript file inside the root and returns its text", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": "export const ticket = 1;\n" });
  const workspace = await openWorkspace(root);

  assert.equal(await workspace.readText("src/ticket.ts"), "export const ticket = 1;\n");
});

it("rejects an absolute path before reading anything", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": "export const ticket = 1;\n" });
  const workspace = await openWorkspace(root);
  // This absolute path does not exist: a reader would answer FILE_UNREADABLE, so
  // PATH_OUTSIDE_ROOT proves the rejection happens before any read.
  const outside = path.join(tmpdir(), "refactor-report-absent-file.ts");

  await assert.rejects(() => workspace.readText(outside), { code: "PATH_OUTSIDE_ROOT" });
});

it("rejects an existing file reached by climbing out of the root", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": "export const ticket = 1;\n" });
  const sibling = await mkdtemp(path.join(tmpdir(), "refactor-report-out-"));
  t.after(() => rm(sibling, { recursive: true, force: true }));
  await writeFile(path.join(sibling, "sneaky.ts"), "export const sneaky = 1;\n", "utf8");
  const escape = path.relative(root, path.join(sibling, "sneaky.ts"));
  const workspace = await openWorkspace(root);

  assert.equal(escape.startsWith(".."), true);
  await assert.rejects(() => workspace.readText(escape), { code: "PATH_OUTSIDE_ROOT" });
});

it("rejects a symlink inside the root whose target lives outside it", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": "export const ticket = 1;\n" });
  const sibling = await mkdtemp(path.join(tmpdir(), "refactor-report-link-"));
  t.after(() => rm(sibling, { recursive: true, force: true }));
  await writeFile(path.join(sibling, "secret.ts"), "export const secret = 1;\n", "utf8");
  await symlink(path.join(sibling, "secret.ts"), path.join(root, "src/alias.ts"));
  const workspace = await openWorkspace(root);

  await assert.rejects(() => workspace.readText("src/alias.ts"), { code: "PATH_OUTSIDE_ROOT" });
});

it("reports FILE_UNREADABLE for a file the process cannot read", async (t) => {
  const root = await makeRoot(t, { "src/locked.ts": "export const locked = 1;\n" });
  await chmod(path.join(root, "src/locked.ts"), 0o000);
  const workspace = await openWorkspace(root);

  await assert.rejects(() => workspace.readText("src/locked.ts"), { code: "FILE_UNREADABLE" });
});

it("reports FILE_UNREADABLE for a path inside the root that does not exist", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": "export const ticket = 1;\n" });
  const workspace = await openWorkspace(root);

  await assert.rejects(() => workspace.readText("src/absent.ts"), { code: "FILE_UNREADABLE" });
});

it("names an unsupported extension instead of reading the file", async (t) => {
  const root = await makeRoot(t, {
    "src/notes.js": "export const notes = 1;\n",
    "src/view.tsx": "export const view = 1;\n",
  });
  const workspace = await openWorkspace(root);

  await assert.rejects(
    () => workspace.readText("src/notes.js"),
    (error: WorkspaceError) =>
      error.code === "LANGUAGE_UNSUPPORTED" && error.paths === undefined,
  );
  assert.equal(await workspace.readText("src/view.tsx"), "export const view = 1;\n");
});

it("enumerates source files while skipping node_modules, dist and .git", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts": "export const ticket = 1;\n",
    "src/deep/view.tsx": "export const view = 1;\n",
    "node_modules/pkg/index.ts": "export const dep = 1;\n",
    "dist/index.ts": "export const built = 1;\n",
    ".git/config": "[core]\n",
  });
  const workspace = await openWorkspace(root);

  assert.deepEqual(await workspace.listFiles(), ["src/deep/view.tsx", "src/ticket.ts"]);
});

it("does not enumerate a symlink whose target lives outside the root", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": "export const ticket = 1;\n" });
  const sibling = await mkdtemp(path.join(tmpdir(), "refactor-report-guard-"));
  t.after(() => rm(sibling, { recursive: true, force: true }));
  await writeFile(path.join(sibling, "secret.ts"), "export const secret = 1;\n", "utf8");
  await symlink(path.join(sibling, "secret.ts"), path.join(root, "src/alias.ts"));
  await symlink(sibling, path.join(root, "vendor"));
  const workspace = await openWorkspace(root);

  assert.deepEqual(await workspace.listFiles(), ["src/ticket.ts"]);
});
