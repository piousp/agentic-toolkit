import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import type { TestContext } from "node:test";

// R8: the static half of the read-only guarantee. A run cannot change the tree because
// the sources hold no write at all; the guard reads them as text and refuses the names a
// write is spelled with, the one module allowed to spawn a process, and any runtime
// dependency the package was not fixed to carry.
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_DIRECTORY = path.join(PACKAGE_ROOT, "src");

// Every filesystem write is one of these names, sync or async: the scan matches the call
// and not the bare word, so "truncated" in a comment is not a finding while
// `truncate(p)` is. A comment that spells a write as a call is a false failure, and
// that is the direction a guard must fail in.
const WRITE_NAMES = [
  "appendFile",
  "chmod",
  "chown",
  "copyFile",
  "cp",
  "createWriteStream",
  "link",
  "mkdir",
  "mkdtemp",
  "rename",
  "rm",
  "rmdir",
  "symlink",
  "truncate",
  "unlink",
  "utimes",
  "writeFile",
];

// A stream write is how a stdio server answers its caller, so the two descriptors are
// the only receivers allowed: `handle.write` and `file.write` are filesystem writes with
// a longer name, and the rule below names them instead of skipping the whole name.
const ALLOWED_STREAM_WRITES = ["process.stderr.write(", "process.stdout.write("];

// D11: the whole git surface the package may spawn. `status` is absent on purpose: it
// rewrites .git/index and would void the manifest the dynamic guard compares.
const ALLOWED_GIT_SUBCOMMANDS = ["diff", "ls-files", "rev-parse"];
const FORBIDDEN_GIT_SUBCOMMANDS = ["add", "apply", "checkout", "clean", "commit", "reset", "stash"];

// The two modules that read this machine, exempt by name and by imported operation: a
// read is what they may do, and the allowlist below is the whole of it.
const READING_MODULES = ["rulesets.ts", "workspace.ts"];
const READ_ONLY_FS_EXPORTS = [
  "access",
  "constants",
  "Dirent",
  "lstat",
  "opendir",
  "readdir",
  "readFile",
  "readlink",
  "realpath",
  "stat",
  "Stats",
];

// The four runtime dependencies the plan fixes: the MCP SDK, the parser, the YAML reader
// and the schema. A fifth one is a decision this install cannot make on its own.
const RUNTIME_DEPENDENCIES = ["@modelcontextprotocol/server", "typescript", "yaml", "zod"];

type Sources = ReadonlyMap<string, string>;

async function readSources(directory: string): Promise<Sources> {
  const sources = new Map<string, string>();

  async function walk(absoluteDirectory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const relative = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
      const absolute = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }
      if (entry.isFile()) {
        sources.set(relative, await readFile(absolute, "utf8"));
      }
    }
  }

  await walk(directory, "");
  return sources;
}

function callPattern(name: string): RegExp {
  return new RegExp(`\\b${name}(?:Sync)?\\s*\\(`);
}

function writesOf(relativePath: string, text: string): string[] {
  return WRITE_NAMES.filter((name) => callPattern(name).test(text)).map(
    (name) => `${relativePath}: ${name}`,
  );
}

// A stream write outside the two descriptors of stdio is a write to whatever the
// receiver is, and the guard does not have to know which file that would be.
function streamWritesOf(relativePath: string, text: string): string[] {
  const findings: string[] = [];
  for (const line of text.split("\n")) {
    if (!/[A-Za-z_$][\w$]*\.write\s*\(/.test(line)) {
      continue;
    }
    if (ALLOWED_STREAM_WRITES.some((allowed) => line.includes(allowed))) {
      continue;
    }
    findings.push(`${relativePath}: ${line.trim()}`);
  }
  return findings;
}

// The program a spawn names, paired with the module that spawns it: a spawn without a
// literal program is a finding of its own, reported as the empty name.
function spawnedProgramsOf(relativePath: string, text: string): string[] {
  return [
    ...text.matchAll(/\b(?:exec|execFile|execSync|execFileSync|spawn|spawnSync|fork)(?:Async)?\s*\(\s*"([^"]*)"/g),
  ].flatMap((match) => (match[1] === undefined ? [] : [`${relativePath}: ${match[1]}`]));
}

// The first element of every argv array literal in a module: the subcommand position of
// the calls this package makes, read from the source instead of from a list kept beside
// it, so a fourth subcommand added later is a finding.
function argvHeadsOf(text: string): string[] {
  return [...text.matchAll(/\[\s*"([a-z][a-z-]*)"/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function fsImportedNamesOf(text: string): string[] {
  return [
    ...text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"node:fs(?:\/promises)?"/g),
  ].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  );
}

async function makeSources(t: TestContext, files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "refactor-report-source-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all(
    Object.entries(files).map(async ([relative, text]) => {
      const absolute = path.join(directory, relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, text, "utf8");
    }),
  );
  return directory;
}

it("finds no write in the sources, so a run of this server cannot change a tree", async () => {
  const sources = await readSources(SOURCE_DIRECTORY);
  // The exemptions below name three modules; a renamed module is a guard to update, not
  // an exemption that quietly stops applying.
  assert.deepEqual([...sources.keys()].filter((file) => file === "git.ts" || READING_MODULES.includes(file)).sort(), [
    "git.ts",
    "rulesets.ts",
    "workspace.ts",
  ]);

  const writes = [...sources].flatMap(([file, text]) => writesOf(file, text));
  assert.deepEqual(writes, []);
  const streamWrites = [...sources].flatMap(([file, text]) => streamWritesOf(file, text));
  assert.deepEqual(streamWrites, []);
});

it("spawns git from one module, with the three read-only subcommands and no other program", async () => {
  const sources = await readSources(SOURCE_DIRECTORY);

  const spawners = [...sources]
    .filter(([, text]) => text.includes("node:child_process"))
    .map(([file]) => file);
  assert.deepEqual(spawners, ["git.ts"]);

  const programs = [...sources].flatMap(([file, text]) => spawnedProgramsOf(file, text));
  assert.ok(programs.length > 0, "the git adapter spawns no program at all");
  assert.deepEqual([...new Set(programs.map((entry) => entry.split(": ")[1]))], ["git"]);

  const git = sources.get("git.ts");
  assert.ok(git !== undefined);
  assert.deepEqual([...new Set(argvHeadsOf(git))].sort(), ALLOWED_GIT_SUBCOMMANDS);
  for (const forbidden of FORBIDDEN_GIT_SUBCOMMANDS) {
    assert.equal(
      git.includes(`"${forbidden}"`),
      false,
      `git ${forbidden} changes the work tree or the index and cannot be spawned here`,
    );
  }
});

it("reads the machine from two modules and only with operations that do not write", async () => {
  const sources = await readSources(SOURCE_DIRECTORY);

  const readers = [...sources]
    .filter(([, text]) => /from\s+"node:fs(?:\/promises)?"/.test(text))
    .map(([file]) => file)
    .sort();
  assert.deepEqual(readers, READING_MODULES);

  for (const reader of READING_MODULES) {
    const text = sources.get(reader);
    assert.ok(text !== undefined);
    for (const name of fsImportedNamesOf(text)) {
      assert.ok(
        READ_ONLY_FS_EXPORTS.includes(name),
        `${reader} imports ${name} from node:fs, and the guard allows reads only`,
      );
    }
  }
});

it("carries exactly the four runtime dependencies the plan fixed", async () => {
  const manifest = JSON.parse(await readFile(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };

  assert.deepEqual(Object.keys(manifest.dependencies ?? {}).sort(), RUNTIME_DEPENDENCIES);
});

it("flags a write, an unlisted spawn and a mutating git subcommand in a synthetic source", async (t) => {
  const directory = await makeSources(t, {
    "store.ts": 'import { writeFile } from "node:fs/promises";\nawait writeFile("a.ts", "b");\n',
    "handle.ts": "await handle.write(chunk);\n",
    "publish.ts": 'await execFile("npm", ["publish"]);\n',
    "git.ts": 'const argv = ["checkout", "main"];\n',
  });
  const sources = await readSources(directory);

  // Without this case a broken pattern would pass over the package sources in silence,
  // which is the one way a read-only guard can be worthless while staying green.
  assert.deepEqual(
    [...sources].flatMap(([file, text]) => writesOf(file, text)),
    ["store.ts: writeFile"],
  );
  assert.deepEqual(
    [...sources].flatMap(([file, text]) => streamWritesOf(file, text)),
    ["handle.ts: await handle.write(chunk);"],
  );
  assert.deepEqual(
    [...sources].flatMap(([file, text]) => spawnedProgramsOf(file, text)),
    ["publish.ts: npm"],
  );

  const git = sources.get("git.ts");
  assert.ok(git !== undefined);
  const heads = argvHeadsOf(git);
  assert.deepEqual(heads, ["checkout"]);
  assert.ok(FORBIDDEN_GIT_SUBCOMMANDS.some((forbidden) => heads.includes(forbidden)));
});
