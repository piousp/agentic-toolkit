import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, readlink, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { it } from "node:test";
import type { TestContext } from "node:test";

import type { Git } from "../src/git.ts";
import { runMeasure } from "../src/measure.ts";
import { runPreview } from "../src/preview.ts";
import { openWorkspace } from "../src/workspace.ts";

// R8/R11: the dynamic half of the read-only guarantee. A run measures and previews a
// real tree, and the manifest of that tree afterwards is the manifest it had before, line
// for line. The tree is not shipped with this package: the guard reads it from the
// environment, so a clean clone stays green and the run against a real project is one
// export away.
const TARGET_VARIABLE = "REFACTOR_REPORT_TARGET";
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const PUBLISHED_RULESET = "extract.yaml";

// D11: the area mode reads the tree and runs no git at all, and `git status` alone would
// rewrite .git/index and void the comparison below. The adapter is the boundary the diff
// mode reads through, so this double refuses every method: an invocation during the run is
// a finding about the read-only property, not a setup detail.
function unusedGit(): Git {
  function refuse(method: string): () => Promise<never> {
    return () => {
      throw new Error(`the read-only guard ran git ${method}, which the area mode never does`);
    };
  }
  return {
    resolveCommit: refuse("resolveCommit"),
    changedPaths: refuse("changedPaths"),
    deletedPaths: refuse("deletedPaths"),
    untrackedPaths: refuse("untrackedPaths"),
  };
}

// R3/R5: preview names a ruleset by the prefix of its content digest, and the digest is
// the one sha256sum prints for the published bytes. Computing it here from the file keeps
// the guard honest about a ruleset that changes under it.
async function publishedRecipe(): Promise<string> {
  const bytes = await readFile(path.join(PACKAGE_ROOT, "rulesets", PUBLISHED_RULESET));
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `${PUBLISHED_RULESET}#sha256:${digest.slice(0, 12)}`;
}

// The same line format sha256sum prints, so the manifest of a run is checkable outside
// this process. A symlink carries its target instead of the bytes it resolves to: a write
// through it would leave the target's bytes changed, and the entry still differs.
async function manifestOf(directory: string): Promise<string[]> {
  const lines: string[] = [];

  async function walk(absoluteDirectory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const relative = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
      const absolute = path.join(absoluteDirectory, entry.name);
      // lstat through the dirent, so an entry is the file the tree holds and never the
      // file a link points at.
      if (entry.isSymbolicLink()) {
        lines.push(`link  ${relative} -> ${await readlink(absolute)}`);
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }
      if (entry.isFile()) {
        const digest = createHash("sha256").update(await readFile(absolute)).digest("hex");
        lines.push(`${digest}  ${relative}`);
      }
    }
  }

  await walk(directory, "");
  return lines.sort();
}

async function targetTreeOrSkip(t: TestContext): Promise<string | null> {
  const configured = process.env[TARGET_VARIABLE];
  if (configured === undefined || configured === "") {
    t.skip(
      `export ${TARGET_VARIABLE}=<directory> to run the read-only guard over a real tree, e.g. ${TARGET_VARIABLE}=src`,
    );
    return null;
  }
  try {
    const info = await stat(configured);
    if (!info.isDirectory()) {
      t.skip(`${TARGET_VARIABLE}=${configured} is not a directory; export it to a tree to measure`);
      return null;
    }
    return await realpath(configured);
  } catch {
    t.skip(`${TARGET_VARIABLE}=${configured} does not exist; export it to a tree to measure`);
    return null;
  }
}

it("measures and previews a tree without changing one byte of it", async (t) => {
  const root = await targetTreeOrSkip(t);
  if (root === null) {
    return;
  }

  const before = await manifestOf(root);
  // An empty tree would make the comparison below pass without comparing anything.
  assert.ok(before.length > 0, `${root} holds no file, so the guard has nothing to compare`);

  const workspace = await openWorkspace(root);
  const measured = await runMeasure(
    { scope: { mode: "area", area: { kind: "repository" } } },
    { workspace, git: unusedGit() },
  );
  assert.ok(
    measured.scope.files.length > 0,
    `${root} resolves no TypeScript file, so the run below no longer measures anything`,
  );

  const preview = await runPreview(
    { recipe: { ruleset: await publishedRecipe() }, paths: [...measured.scope.files] },
    { workspace },
  );
  assert.equal(preview.applied, false);

  assert.deepEqual(await manifestOf(root), before);
});
