import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

// The package root is derived from this file, so no machine path is written down, and
// the entry the case invokes first sits beside the manifest: `test:cli` builds it
// before this case runs.
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = path.join(PACKAGE_ROOT, "dist", "cli.js");

// R3: the tree a measure answer is replayed in is the tree it measured, and that tree
// is not this package: an evidence command whose entry token only resolves inside the
// package is a command no caller can paste. The case therefore measures a directory of
// its own, and the entry is named there by a path relative to it.
const MEASURED_AREA = "module:src";

// The two files are an import apart, so `importers` is a number a stale or wrong tree
// would change and the round trip compares it like any other metric.
const MEASURED_FILES: Readonly<Record<string, string>> = {
  "src/content.ts": "export function contentOf(raw: string): string {\n  return raw.trim();\n}\n",
  "src/caller.ts":
    'import { contentOf } from "./content.ts";\n\nexport function callerOf(raw: string): string {\n  return contentOf(raw);\n}\n',
};

// R4: a preview is replayed the same way a measure answer is, so the tree of that case
// carries a source the published rule set matches: `http-status-const` lifts the
// literal `"200"` of `extract.yaml`, which is what makes the answer a change at all.
const PREVIEW_FILES: Readonly<Record<string, string>> = {
  "src/ticket.ts":
    'export function accepted(ticket: Ticket): boolean {\n  return ticket.status === "200";\n}\n',
};

// sha256sum rulesets/extract.yaml, computed from the published bytes with sha256sum and
// never printed by the implementation: the recipe names the rule set by the prefix of
// its content digest, which is what R6 puts in front of every run.
const EXTRACT_DIGEST = "72e6628994f02c10ddd1ea11d28f77c64cfb13e783e33a0cfb6ff7852a91dd9d";

const PREVIEW_RECIPE = `extract.yaml#sha256:${EXTRACT_DIGEST.slice(0, 12)}`;

const PREVIEW_PATH = "src/ticket.ts";

const PREVIEW_RULE = "http-status-const";

type EvidenceEntry = { readonly command: string };

type FileEntry = {
  readonly path: string;
  readonly evidence: Readonly<Record<string, EvidenceEntry>>;
} & Readonly<Record<string, unknown>>;

type Answer = {
  readonly verb: string;
  readonly files: readonly FileEntry[];
};

// The two document values of a preview travel with the one command that prints the
// whole answer, so the case reads them back from the fields the document carries.
type PreviewAnswer = Answer & {
  readonly applied: boolean;
  readonly change_digest: string;
  readonly ruleset: { readonly ruleset_digest: string };
  readonly evidence: Readonly<Record<string, EvidenceEntry>>;
};

type Spawned = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

// tmpdir() does not always hand back the path it reports — `/tmp` resolves elsewhere on
// some systems — and the entry reports the root it resolved, so the case works with the
// real one throughout.
async function makeMeasuredTree(
  files: Readonly<Record<string, string>> = MEASURED_FILES,
): Promise<string> {
  const tree = await realpath(await mkdtemp(path.join(tmpdir(), "refactor-report-cli-")));
  await Promise.all(
    Object.entries(files).map(async ([relative, text]) => {
      const absolute = path.join(tree, relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, text, "utf8");
    }),
  );
  return tree;
}

// A token that resolves to nothing is the answer this case exists to refuse, so the
// probe answers null instead of throwing out of the run.
async function realpathOrNull(candidate: string): Promise<string | null> {
  try {
    return await realpath(candidate);
  } catch {
    return null;
  }
}

// The entry as a caller has it: the interpreter on PATH, the argv of the grammar, and
// the tree the command runs in. The first call names the build by the absolute path the
// case knows; every later call pastes the command the answer wrote.
function runIn(root: string, argumentList: readonly string[]): Spawned {
  const spawned = spawnSync(process.execPath, [...argumentList], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: spawned.status, stdout: spawned.stdout, stderr: spawned.stderr };
}

// A command is written for a shell, so a token is a run of blanks-separated
// characters and single quotes group the token that carries a blank. The splitter
// reads the spelling a caller would paste, never the argv the code assembled.
function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quoted = false;
  for (const character of command) {
    if (quoted) {
      if (character === "'") {
        quoted = false;
      } else {
        current += character;
      }
      continue;
    }
    if (character === "'") {
      quoted = true;
      started = true;
      continue;
    }
    if (character === " ") {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += character;
    started = true;
  }
  if (quoted) {
    assert.fail(`the command leaves a quote open: ${command}`);
  }
  if (started) {
    tokens.push(current);
  }
  return tokens;
}

function parses<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    assert.fail(`${label} wrote a body that is not JSON: ${JSON.stringify(text)}`);
  }
}

// The replay of one evidence command: the interpreter comes from PATH, the tree is the
// one the command was written for, and the entry token is checked before the answer is
// read, so a command that only resolves elsewhere is refused instead of replayed.
async function replayEvidence<T>(
  tree: string,
  build: string,
  command: string,
  label: string,
): Promise<T> {
  const tokens = tokenize(command);
  assert.equal(
    tokens[0],
    "node",
    `the evidence command does not name an interpreter: ${command}`,
  );

  const replayed = runIn(tree, tokens.slice(1));
  assert.equal(
    replayed.status,
    0,
    `${label} exited ${String(replayed.status)} when pasted in the tree it previews; stderr: ${replayed.stderr}`,
  );

  const entryToken = tokens[1];
  assert.ok(entryToken !== undefined, `the evidence command names no entry: ${command}`);
  assert.equal(
    path.isAbsolute(entryToken),
    false,
    `the evidence command names an absolute entry path: ${command}`,
  );
  assert.equal(
    await realpathOrNull(path.resolve(tree, entryToken)),
    build,
    `${label} names the entry ${JSON.stringify(entryToken)}, which does not resolve to the build the answer came from`,
  );

  return parses<T>(replayed.stdout, command);
}

// A document value is named by the evidence entry that carries it, so the value is read
// from the field of the document with that name and a name this case does not know is
// refused instead of skipped.
function documentValueOf(answer: PreviewAnswer, name: string): unknown {
  if (name === "ruleset_digest") {
    return answer.ruleset.ruleset_digest;
  }
  if (name === "change_digest") {
    return answer.change_digest;
  }
  assert.fail(`the preview document carries no value named ${name}`);
}

// R4/D8: the evidence of a reported number is a command, and the command is worth
// keeping only if a caller who pastes it in the measured tree sees the same number. The
// case takes the answer the entry produced, re-runs each `evidence.<metric>.command` it
// carries from that tree, and compares the answer of that run with the value it recorded.
it(
  "re-runs every evidence command of a measure answer from the measured tree and matches each value",
  { timeout: 180_000 },
  async (t) => {
    const tree = await makeMeasuredTree();
    t.after(() => rm(tree, { recursive: true, force: true }));
    const build = await realpath(CLI);

    const measured = runIn(tree, [CLI, "measure", "--area", MEASURED_AREA]);
    assert.equal(
      measured.status,
      0,
      `the entry did not measure ${MEASURED_AREA} from a tree of its own; status ${String(measured.status)}; stderr: ${measured.stderr}`,
    );
    const answer = parses<Answer>(measured.stdout, "measure");
    assert.equal(answer.verb, "measure");
    assert.ok(answer.files.length > 0, `measure answered no file for ${MEASURED_AREA}`);

    const checked: string[] = [];
    for (const file of answer.files) {
      for (const [metric, entry] of Object.entries(file.evidence)) {
        const label = `${file.path} ${metric} via ${JSON.stringify(entry.command)}`;
        const tokens = tokenize(entry.command);
        assert.equal(
          tokens[0],
          "node",
          `the evidence command does not name an interpreter: ${entry.command}`,
        );

        const replayed = runIn(tree, tokens.slice(1));
        assert.equal(
          replayed.status,
          0,
          `${label} exited ${String(replayed.status)} when pasted in the tree it measures; stderr: ${replayed.stderr}`,
        );

        // R3: the command runs in the measured tree only if its entry token is a path
        // relative to that tree which lands on the build the answer came from. An
        // absolute token would replay on this machine alone and a bare `dist/cli.js`
        // names a file the measured tree does not hold.
        const entryToken = tokens[1];
        assert.ok(
          entryToken !== undefined,
          `the evidence command names no entry: ${entry.command}`,
        );
        assert.equal(
          path.isAbsolute(entryToken),
          false,
          `the evidence command names an absolute entry path: ${entry.command}`,
        );
        assert.equal(
          await realpathOrNull(path.resolve(tree, entryToken)),
          build,
          `${label} names the entry ${JSON.stringify(entryToken)}, which does not resolve to the build the answer came from`,
        );

        const redone = parses<Answer>(replayed.stdout, entry.command);
        assert.deepEqual(
          redone.files.map((entryOfFile) => entryOfFile.path),
          [file.path],
          `${label} answered the files of another scope`,
        );
        assert.deepEqual(
          redone.files[0]?.[metric],
          file[metric],
          `${label} does not reproduce the value it recorded`,
        );
        checked.push(`${file.path} ${metric}`);
      }
    }

    assert.ok(checked.length > 0, `no evidence command travelled with the answer of ${MEASURED_AREA}`);
  },
);

// R4/D8: the evidence of a preview is a command too, and it is worth keeping only if a
// caller who pastes it in the tree the preview read sees the same value. The case takes
// the answer the entry produced, re-runs the two document commands and the two commands
// of each file, and compares every one of them with the value the answer recorded.
it(
  "re-runs every evidence command of a preview answer from the measured tree and matches each value",
  { timeout: 180_000 },
  async (t) => {
    const tree = await makeMeasuredTree(PREVIEW_FILES);
    t.after(() => rm(tree, { recursive: true, force: true }));
    const build = await realpath(CLI);

    // The first call is the one a caller makes from its own tree: the entry named by the
    // absolute path this case knows, pasted in the tree the preview reads.
    const initial = runIn(tree, [
      CLI,
      "preview",
      "--recipe",
      PREVIEW_RECIPE,
      "--rule",
      PREVIEW_RULE,
      "--path",
      PREVIEW_PATH,
    ]);
    assert.equal(
      initial.status,
      0,
      `the entry did not preview ${PREVIEW_PATH} in a tree of its own; status ${String(initial.status)}; stderr: ${initial.stderr}`,
    );
    const answer = parses<PreviewAnswer>(initial.stdout, "preview");
    assert.equal(answer.verb, "preview");
    assert.equal(answer.applied, false);
    assert.ok(
      answer.files.length > 0,
      `the recipe ${PREVIEW_RULE} of ${PREVIEW_RECIPE} planned no change for ${PREVIEW_PATH}`,
    );

    const checked: string[] = [];
    for (const [name, entry] of Object.entries(answer.evidence)) {
      const label = `${name} via ${JSON.stringify(entry.command)}`;
      const redone = await replayEvidence<PreviewAnswer>(tree, build, entry.command, label);
      assert.deepEqual(
        documentValueOf(redone, name),
        documentValueOf(answer, name),
        `${label} does not reproduce the value it recorded`,
      );
      checked.push(name);
    }

    for (const file of answer.files) {
      for (const [metric, entry] of Object.entries(file.evidence)) {
        const label = `${file.path} ${metric} via ${JSON.stringify(entry.command)}`;
        const redone = await replayEvidence<PreviewAnswer>(tree, build, entry.command, label);
        const redoneFile = redone.files.find((candidate) => candidate.path === file.path);
        assert.ok(
          redoneFile !== undefined,
          `${label} answered no entry for ${file.path}; it answered ${JSON.stringify(redone.files.map((candidate) => candidate.path))}`,
        );
        assert.deepEqual(
          redoneFile[metric],
          file[metric],
          `${label} does not reproduce the value it recorded`,
        );
        checked.push(`${file.path} ${metric}`);
      }
    }

    assert.deepEqual(
      checked.sort(),
      [
        "change_digest",
        "ruleset_digest",
        `${PREVIEW_PATH} delta`,
        `${PREVIEW_PATH} diff`,
      ].sort(),
      `the answer of ${PREVIEW_RECIPE} did not travel with one command per value`,
    );
  },
);
