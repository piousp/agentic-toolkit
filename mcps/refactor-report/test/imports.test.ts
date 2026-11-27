import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import type { TestContext } from "node:test";

import { buildImportGraph } from "../src/imports.ts";
import { openWorkspace } from "../src/workspace.ts";

async function makeRoot(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "refactor-report-imports-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, text] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, text, "utf8");
  }
  return root;
}

it("counts the module that imports a relative specifier naming the extension", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts": "export const ticket = 1;\n",
    "src/pick.ts": 'import { ticket } from "./ticket.ts";\n\nexport const picked = ticket;\n',
  });
  const graph = await buildImportGraph(await openWorkspace(root));

  assert.deepEqual(graph.importersOf("src/ticket.ts"), { count: 1, modules: ["src/pick.ts"] });
  assert.deepEqual(graph.importersOf("src/pick.ts"), { count: 0, modules: [] });
});

it("resolves a relative specifier without an extension across the accepted extensions", async (t) => {
  const root = await makeRoot(t, {
    "src/a.ts": "export const a = 1;\n",
    "src/b.tsx": "export const b = 1;\n",
    "src/c.mts": "export const c = 1;\n",
    "src/d.cts": "export const d = 1;\n",
    "src/pick.ts": [
      'import { a } from "./a";',
      'import { b } from "./b";',
      'import { c } from "./c";',
      'import { d } from "./d";',
      "",
      "export const picked = [a, b, c, d];",
      "",
    ].join("\n"),
  });
  const graph = await buildImportGraph(await openWorkspace(root));

  for (const target of ["src/a.ts", "src/b.tsx", "src/c.mts", "src/d.cts"]) {
    assert.deepEqual(graph.importersOf(target), { count: 1, modules: ["src/pick.ts"] }, target);
  }
});

it("resolves a relative specifier to the index of a directory", async (t) => {
  const root = await makeRoot(t, {
    "src/dir/index.ts": "export const inner = 1;\n",
    "src/pick.ts": 'import { inner } from "./dir";\n\nexport const picked = inner;\n',
  });
  const graph = await buildImportGraph(await openWorkspace(root));

  assert.deepEqual(graph.importersOf("src/dir/index.ts"), { count: 1, modules: ["src/pick.ts"] });
});

it("counts a re-export as an edge", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts": "export const ticket = 1;\n",
    "src/labels.ts": "export const label = 2;\n",
    "src/index.ts": 'export * from "./ticket.ts";\nexport { label } from "./labels.ts";\n',
  });
  const graph = await buildImportGraph(await openWorkspace(root));

  assert.deepEqual(graph.importersOf("src/ticket.ts"), { count: 1, modules: ["src/index.ts"] });
  assert.deepEqual(graph.importersOf("src/labels.ts"), { count: 1, modules: ["src/index.ts"] });
});

it("counts two modules that import the same file", async (t) => {
  const root = await makeRoot(t, {
    "src/ticket.ts": "export const ticket = 1;\n",
    "src/pick.ts": 'import { ticket } from "./ticket.ts";\n\nexport const picked = ticket;\n',
    "src/mark.ts": 'import { ticket } from "./ticket";\n\nexport const marked = ticket;\n',
  });
  const graph = await buildImportGraph(await openWorkspace(root));

  assert.deepEqual(graph.importersOf("src/ticket.ts"), {
    count: 2,
    modules: ["src/mark.ts", "src/pick.ts"],
  });
});
