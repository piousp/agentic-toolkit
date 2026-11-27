import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import type { TestContext } from "node:test";
import { promisify } from "node:util";

import { createGit } from "../src/git.ts";
import type { Git } from "../src/git.ts";
import { runMeasure } from "../src/measure.ts";
import { resolveAreaScope, resolveDiffScope } from "../src/scope.ts";
import { openWorkspace } from "../src/workspace.ts";
import type { WorkspaceError } from "../src/workspace.ts";

const execFileAsync = promisify(execFile);

async function makeRoot(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "refactor-report-scope-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, text] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, text, "utf8");
  }
  return root;
}

async function gitIn(root: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout.trim();
}

// A repository with one commit is the working tree the diff mode reads: the
// identity is passed per call so the test never depends on a global git config.
async function commitAll(root: string): Promise<string> {
  await gitIn(root, ["init", "-q"]);
  await gitIn(root, ["add", "."]);
  await gitIn(root, [
    "-c",
    "user.name=dev",
    "-c",
    "user.email=dev",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "init",
  ]);
  return gitIn(root, ["rev-parse", "HEAD"]);
}

it("adds an untracked file the diff against the base does not report", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts": "export const ticket = 1;\n",
    ".gitignore": "src/ignored.ts\n",
  });
  const head = await commitAll(root);
  await writeFile(path.join(root, "src/ticket.ts"), "export const ticket = 2;\n", "utf8");
  await writeFile(path.join(root, "src/fresh.ts"), "export const fresh = 1;\n", "utf8");
  await writeFile(path.join(root, "src/ignored.ts"), "export const ignored = 1;\n", "utf8");
  const git = createGit(await openWorkspace(root));

  const scope = await resolveDiffScope({ scope: { mode: "diff", base: "HEAD" } }, git);

  assert.deepEqual(scope, {
    mode: "diff",
    base: "HEAD",
    base_commit: head,
    files: ["src/fresh.ts", "src/ticket.ts"],
    skipped: [],
  });
});

it("refuses a request carrying both scope modes before calling git", async () => {
  const calls: string[] = [];
  const git: Git = {
    resolveCommit: async (base) => {
      calls.push(`rev-parse --verify ${base}^{commit}`);
      return "0".repeat(40);
    },
    changedPaths: async (base) => {
      calls.push(`diff --name-only --diff-filter=ACMR ${base}`);
      return [];
    },
    deletedPaths: async (base) => {
      calls.push(`diff --name-only --diff-filter=D ${base}`);
      return [];
    },
    untrackedPaths: async () => {
      calls.push("ls-files --others --exclude-standard");
      return [];
    },
  };

  await assert.rejects(
    () =>
      resolveDiffScope(
        { scope: { mode: "diff", base: "HEAD", area: { kind: "repository" } } },
        git,
      ),
    { code: "SCOPE_DOUBLE" },
  );
  assert.deepEqual(calls, []);
});

it("resolves a function symbol to its file and start line", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts":
      '// ticket parsing\nexport const header = "t";\n\nexport function parse(ticket: string): number {\n  return ticket.length;\n}\n',
    "src/other.ts": 'export function render(): string {\n  return "";\n}\n',
  });
  const workspace = await openWorkspace(root);

  const scope = await resolveAreaScope(
    {
      scope: {
        mode: "area",
        area: { kind: "function", path: "src/ticket.ts", symbol: "parse" },
      },
    },
    workspace,
  );

  assert.deepEqual(scope, {
    mode: "area",
    base: null,
    base_commit: null,
    area: { kind: "function", path: "src/ticket.ts", symbol: "parse", start_line: 4 },
    files: ["src/ticket.ts"],
    skipped: [],
  });
});

it("resolves a class symbol to its declaration", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts":
      'export class Ticket {\n  readonly id: string;\n\n  constructor(id: string) {\n    this.id = id;\n  }\n}\n',
    "src/other.ts": "export const other = 1;\n",
  });
  const workspace = await openWorkspace(root);

  const scope = await resolveAreaScope(
    { scope: { mode: "area", area: { kind: "class", path: "src/ticket.ts", symbol: "Ticket" } } },
    workspace,
  );

  assert.deepEqual(scope, {
    mode: "area",
    base: null,
    base_commit: null,
    area: { kind: "class", path: "src/ticket.ts", symbol: "Ticket", start_line: 1 },
    files: ["src/ticket.ts"],
    skipped: [],
  });
});

it("resolves a module path to the directory tree or to the single file it names", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket/index.ts": "export const index = 1;\n",
    "src/ticket/parse.ts": "export const parse = 1;\n",
    "src/ticket/README.md": "# ticket\n",
    "src/other.ts": "export const other = 1;\n",
  });
  const workspace = await openWorkspace(root);

  const directory = await resolveAreaScope(
    { scope: { mode: "area", area: { kind: "module", path: "src/ticket" } } },
    workspace,
  );
  const single = await resolveAreaScope(
    { scope: { mode: "area", area: { kind: "module", path: "src/other.ts" } } },
    workspace,
  );

  assert.deepEqual(directory, {
    mode: "area",
    base: null,
    base_commit: null,
    area: { kind: "module", path: "src/ticket" },
    files: ["src/ticket/index.ts", "src/ticket/parse.ts"],
    skipped: [],
  });
  assert.deepEqual(single.files, ["src/other.ts"]);
});

it("measures the root of a repository minus what a build, a generator or a vendored copy writes", async (t) => {
  const root = await makeRoot(t, {
    "src/a.ts": "export const a = 1;\n",
    "src/nested/b.ts": "export const b = 1;\n",
    "build/c.ts": "export const c = 1;\n",
    "src/nested/build/d.ts": "export const d = 1;\n",
    "out/e.ts": "export const e = 1;\n",
    "generated/f.ts": "export const f = 1;\n",
    "vendor/g.ts": "export const g = 1;\n",
    "third_party/h.ts": "export const h = 1;\n",
    "coverage/i.ts": "export const i = 1;\n",
    "src/schema.generated.ts": "export const schema = 1;\n",
    "src/proto.gen.ts": "export const proto = 1;\n",
    "README.md": "# tree\n",
    "node_modules/dep/x.ts": "export const x = 1;\n",
    "dist/built.ts": "export const built = 1;\n",
  });
  const workspace = await openWorkspace(root);

  const scope = await resolveAreaScope(
    { scope: { mode: "area", area: { kind: "repository" } } },
    workspace,
  );

  assert.deepEqual(scope, {
    mode: "area",
    base: null,
    base_commit: null,
    area: { kind: "repository" },
    files: ["src/a.ts", "src/nested/b.ts"],
    skipped: [],
  });
});

it("names the candidate declaration lines when the symbol does not exist", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts":
      'export function parse(ticket: string): number {\n  return ticket.length;\n}\n\nexport function render(): string {\n  return "";\n}\n',
  });
  const workspace = await openWorkspace(root);

  await assert.rejects(
    () =>
      resolveAreaScope(
        {
          scope: {
            mode: "area",
            area: { kind: "function", path: "src/ticket.ts", symbol: "ticket" },
          },
        },
        workspace,
      ),
    (error: WorkspaceError) => {
      assert.equal(error.code, "SYMBOL_NOT_FOUND");
      assert.deepEqual(error.paths, ["src/ticket.ts:1", "src/ticket.ts:5"]);
      assert.match(error.message, /ticket/);
      return true;
    },
  );
});

it("refuses a symbol that resolves to more than one declaration", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts":
      'export class First {\n  parse(): number {\n    return 1;\n  }\n}\n\nexport class Second {\n  parse(): number {\n    return 2;\n  }\n}\n',
  });
  const workspace = await openWorkspace(root);

  await assert.rejects(
    () =>
      resolveAreaScope(
        {
          scope: {
            mode: "area",
            area: { kind: "function", path: "src/ticket.ts", symbol: "parse" },
          },
        },
        workspace,
      ),
    (error: WorkspaceError) => {
      assert.equal(error.code, "SYMBOL_NOT_FOUND");
      assert.deepEqual(error.paths, ["src/ticket.ts:2", "src/ticket.ts:8"]);
      assert.match(error.message, /2 declarations/);
      return true;
    },
  );
});

it("refuses a path that is not in the set the area resolved", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": "export const ticket = 1;\n" });
  const workspace = await openWorkspace(root);

  await assert.rejects(
    () =>
      resolveAreaScope(
        { scope: { mode: "area", area: { kind: "module", path: "src/missing" } } },
        workspace,
      ),
    { code: "PATH_NOT_IN_SCOPE" },
  );
  await assert.rejects(
    () =>
      resolveAreaScope(
        {
          scope: {
            mode: "area",
            area: { kind: "function", path: "src/missing.ts", symbol: "ticket" },
          },
        },
        workspace,
      ),
    { code: "PATH_NOT_IN_SCOPE" },
  );
});

it("refuses an area request that also carries a diff base", async (t) => {
  const root = await makeRoot(t, { "src/ticket.ts": "export const ticket = 1;\n" });
  const workspace = await openWorkspace(root);

  await assert.rejects(
    () =>
      resolveAreaScope(
        { scope: { mode: "area", base: "HEAD", area: { kind: "repository" } } },
        workspace,
      ),
    { code: "SCOPE_DOUBLE" },
  );
});

// R2/D10: the diff lists every path the working tree changed, and only the paths in
// the measured languages are files this server can read. A path outside them leaves
// the measured set, so the files beside it are still measured and the run keeps its
// answer instead of aborting on the first file it cannot read.
it("still measures the changed TypeScript files when the diff also lists a file it cannot measure", async (t) => {
  const root = await makeRoot(t, {
    "src/a.ts": "export const a = 1;\n",
    "notes.md": "# notes\n",
  });
  const head = await commitAll(root);
  await writeFile(path.join(root, "src/a.ts"), "export const a = 2;\n", "utf8");
  await writeFile(path.join(root, "src/fresh.ts"), "export const fresh = 1;\n", "utf8");
  await writeFile(path.join(root, "notes.md"), "# notes, edited\n", "utf8");
  await writeFile(path.join(root, "data.json"), '{"untracked":true}\n', "utf8");
  const git = createGit(await openWorkspace(root));

  const scope = await resolveDiffScope({ scope: { mode: "diff", base: "HEAD" } }, git);

  assert.equal(scope.base_commit, head);
  assert.deepEqual(scope.files, ["src/a.ts", "src/fresh.ts"]);
});

// R2/D10: a changed path outside the measured languages is named instead of dropped in
// silence. It travels in `skipped` with a reason of its own, which is what feeds the
// caller's "Out of language scope" list, and the run answers instead of ending on it.
it("names a changed file outside the measured languages in skipped instead of failing the run", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts": "export const ticket = 1;\n",
    "notes.md": "# notes\n",
  });
  const head = await commitAll(root);
  await writeFile(path.join(root, "src/ticket.ts"), "export const ticket = 2;\n", "utf8");
  await writeFile(path.join(root, "notes.md"), "# notes, edited\n", "utf8");
  await writeFile(path.join(root, "data.json"), '{"untracked":true}\n', "utf8");
  const workspace = await openWorkspace(root);

  const scope = await resolveDiffScope(
    { scope: { mode: "diff", base: "HEAD" } },
    createGit(workspace),
  );

  assert.equal(scope.base_commit, head);
  assert.deepEqual(scope.skipped, [
    { path: "data.json", reason: "out_of_language_scope" },
    { path: "notes.md", reason: "out_of_language_scope" },
  ]);

  // The defect itself: the service reads every path the scope resolved, so a path
  // outside the measured languages ended the whole run with LANGUAGE_UNSUPPORTED.
  const answer = await runMeasure(
    { scope: { mode: "diff", base: "HEAD" } },
    { workspace, git: createGit(workspace) },
  );
  assert.deepEqual(answer.scope.skipped, scope.skipped);
  assert.deepEqual(
    answer.files.map((file) => file.path),
    ["src/ticket.ts"],
  );
});

it("names a deleted file in skipped instead of measuring it", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts": "export const ticket = 1;\n",
    "src/gone.ts": "export const gone = 1;\n",
  });
  await commitAll(root);
  await rm(path.join(root, "src/gone.ts"));
  const git = createGit(await openWorkspace(root));

  const scope = await resolveDiffScope({ scope: { mode: "diff", base: "HEAD" } }, git);

  assert.deepEqual(scope.files, []);
  assert.deepEqual(scope.skipped, [{ path: "src/gone.ts", reason: "deleted" }]);
});
