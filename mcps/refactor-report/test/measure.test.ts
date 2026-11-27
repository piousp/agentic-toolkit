import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import type { TestContext } from "node:test";

import type { MeasureRequest } from "../src/contracts.ts";
import { errorResult } from "../src/errors.ts";
import { createGit } from "../src/git.ts";
import type { Git } from "../src/git.ts";
import { runMeasure } from "../src/measure.ts";
import { openWorkspace } from "../src/workspace.ts";
import type { Workspace, WorkspaceError } from "../src/workspace.ts";

async function makeRoot(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "refactor-report-measure-"));
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

async function depsOf(root: string): Promise<{ workspace: Workspace; git: ReturnType<typeof createGit> }> {
  const workspace = await openWorkspace(root);
  return { workspace, git: createGit(workspace) };
}

// The git adapter is the boundary the diff mode reads through, so the double
// answers the one listing each test pins and spawns nothing.
function diffGit(changed: readonly string[]): Git {
  return {
    resolveCommit: async (base) => `${base}-commit`,
    changedPaths: async () => [...changed],
    deletedPaths: async () => [],
    untrackedPaths: async () => [],
  };
}

it("reports every key the measure response documents", async (t) => {
  const root = await makeRoot(t, {
    "src/a.ts": "export const a = 1;\n",
    "src/b.ts": "export function b(): number {\n  return 2;\n}\n",
    "README.md": "# tree\n",
  });

  const result = await runMeasure(
    { scope: { mode: "area", area: { kind: "repository" } } },
    await depsOf(root),
  );

  assert.deepEqual(Object.keys(result).sort(), [
    "files",
    "language",
    "metricset",
    "root",
    "scope",
    "verb",
  ]);
  assert.equal(result.verb, "measure");
  assert.equal(result.language, "typescript");
  assert.equal(typeof result.metricset, "string");
  assert.ok(result.metricset.length > 0);

  assert.deepEqual(Object.keys(result.scope).sort(), [
    "area",
    "base",
    "base_commit",
    "files",
    "mode",
    "skipped",
  ]);
  assert.equal(result.scope.mode, "area");
  assert.deepEqual(result.scope.area, { kind: "repository" });
  assert.equal(result.scope.base, null);
  assert.equal(result.scope.base_commit, null);
  assert.deepEqual(result.scope.files, ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(result.scope.skipped, []);

  assert.equal(result.files.length, 2);
  const [first] = result.files;
  assert.ok(first !== undefined);
  assert.deepEqual(Object.keys(first).sort(), [
    "evidence",
    "functions",
    "importers",
    "loc",
    "max_complexity",
    "path",
    "sha256",
  ]);
  assert.equal(first.path, "src/a.ts");
  assert.equal(typeof first.sha256, "string");
  assert.match(first.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(first.loc, 1);
  assert.equal(first.functions, 0);
  assert.equal(first.importers, 0);
  assert.deepEqual(first.max_complexity, { value: 0, unit: null, start_line: null });

  assert.deepEqual(Object.keys(first.evidence).sort(), [
    "functions",
    "importers",
    "loc",
    "max_complexity",
    "sha256",
  ]);
  for (const metric of ["loc", "functions", "max_complexity", "importers", "sha256"] as const) {
    assert.equal(typeof first.evidence[metric]?.command, "string", metric);
    assert.ok((first.evidence[metric]?.command.length ?? 0) > 0, metric);
  }
});

it("echoes the root as a dot instead of the absolute directory it resolved", async (t) => {
  const root = await makeRoot(t, { "src/a.ts": "export const a = 1;\n" });

  const result = await runMeasure(
    { scope: { mode: "area", area: { kind: "repository" } } },
    await depsOf(root),
  );

  assert.equal(result.root, ".");
});

it("serializes an answer and an error without the absolute directory it measured", async (t) => {
  const root = await makeRoot(t, { "src/a.ts": "export const a = 1;\n" });
  const deps = await depsOf(root);

  const answer = await runMeasure(
    { scope: { mode: "area", area: { kind: "repository" } } },
    deps,
  );
  assert.equal(JSON.stringify(answer).includes(deps.workspace.root), false);

  const failure = await runMeasure(
    { scope: { mode: "area", area: { kind: "module", path: path.join(deps.workspace.root, "src") } } },
    deps,
  ).then(
    () => null,
    (error: unknown) => error as WorkspaceError,
  );
  assert.ok(failure !== null);

  const serialized = errorResult({
    code: failure.code,
    detail: failure.message,
    paths: failure.paths,
  });
  const text = serialized.content[0]?.text ?? "";
  assert.equal(text.includes(deps.workspace.root), false, text);
});

it("reports only the metrics the request selects", async (t) => {
  const root = await makeRoot(t, {
    "src/a.ts": "export const a = 1;\n",
    "src/b.ts": "export function b(): number {\n  return 2;\n}\n",
  });

  const result = await runMeasure(
    { scope: { mode: "area", area: { kind: "repository" } }, select: ["loc"] },
    await depsOf(root),
  );

  assert.deepEqual(result.scope.files, ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(
    result.files.map((file) => file.path),
    ["src/a.ts", "src/b.ts"],
  );
  for (const file of result.files) {
    assert.deepEqual(Object.keys(file).sort(), ["evidence", "loc", "path"], file.path);
    assert.deepEqual(Object.keys(file.evidence), ["loc"], file.path);
    assert.equal(typeof file.evidence.loc?.command, "string", file.path);
  }
  assert.equal(result.files[0]?.loc, 1);
  assert.equal(result.files[1]?.loc, 3);
});

it("measures only the diff paths the request names", async (t) => {
  const root = await makeRoot(t, {
    "src/a.ts": "export const a = 1;\n",
    "src/b.ts": "export function b(): number {\n  return 2;\n}\n",
  });
  const workspace = await openWorkspace(root);

  const result = await runMeasure(
    { scope: { mode: "diff", base: "HEAD", paths: ["src/b.ts"] } },
    { workspace, git: diffGit(["src/a.ts", "src/b.ts"]) },
  );

  assert.equal(result.scope.mode, "diff");
  assert.deepEqual(result.scope.files, ["src/b.ts"]);
  assert.deepEqual(
    result.files.map((file) => file.path),
    ["src/b.ts"],
  );
  assert.equal(result.files[0]?.loc, 3);
});

it("refuses a diff path the resolved set does not hold", async (t) => {
  const root = await makeRoot(t, { "src/a.ts": "export const a = 1;\n" });
  const workspace = await openWorkspace(root);

  await assert.rejects(
    () =>
      runMeasure(
        { scope: { mode: "diff", base: "HEAD", paths: ["src/a.ts", "src/missing.ts"] } },
        { workspace, git: diffGit(["src/a.ts"]) },
      ),
    (error: WorkspaceError) => {
      assert.equal(error.code, "PATH_NOT_IN_SCOPE");
      assert.deepEqual(error.paths, ["src/missing.ts"]);
      return true;
    },
  );
});

it("refuses diff paths in an area request", async (t) => {
  const root = await makeRoot(t, { "src/a.ts": "export const a = 1;\n" });
  // The schema in front of the service refuses this shape, but the resolver owns
  // the code, so the request is modelled as the unvalidated payload on the wire.
  const request = JSON.parse(
    '{"scope":{"mode":"area","area":{"kind":"repository"},"paths":["src/a.ts"]}}',
  ) as MeasureRequest;

  const deps = await depsOf(root);

  await assert.rejects(() => runMeasure(request, deps), { code: "SCOPE_INVALID" });
});
