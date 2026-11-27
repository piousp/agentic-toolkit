import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

// The package root is derived from this file, so no machine path is written down.
// It is also the working directory every command of this case runs from: the entry
// resolves its root from there (D2), so `node dist/cli.js ...` is only executable
// in the directory the answer reports as ".".
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

// The area the case measures is a fixture subtree of this package for the reason
// above: an evidence command names the build by a relative path, and the tree it
// measures is the one it runs in.
const MEASURED_AREA = "module:test/fixtures";

type EvidenceEntry = { readonly command: string };

type FileEntry = {
  readonly path: string;
  readonly evidence: Readonly<Record<string, EvidenceEntry>>;
} & Readonly<Record<string, unknown>>;

type Answer = {
  readonly verb: string;
  readonly files: readonly FileEntry[];
};

type Spawned = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

// The entry as a caller has it: the interpreter on PATH, the build beside the
// manifest, and the verb of the grammar.
function runEntry(argumentList: readonly string[]): Spawned {
  const spawned = spawnSync(process.execPath, [...argumentList], {
    cwd: PACKAGE_ROOT,
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

function parses(text: string, label: string): Answer {
  try {
    return JSON.parse(text) as Answer;
  } catch {
    assert.fail(`${label} wrote a body that is not JSON: ${JSON.stringify(text)}`);
  }
}

// R4/D8: the evidence of a reported number is a command, and the command is worth
// keeping only if a caller who pastes it sees the same number. The case takes the
// answer the entry produced, re-runs each `evidence.<metric>.command` it carries,
// and compares the answer of that run with the value it recorded.
it(
  "re-runs every evidence command of a measure answer and matches each value",
  { timeout: 180_000 },
  () => {
    const measured = runEntry([path.join("dist", "cli.js"), "measure", "--area", MEASURED_AREA]);
    assert.equal(
      measured.status,
      0,
      `the entry did not measure ${MEASURED_AREA}; status ${String(measured.status)}; stderr: ${measured.stderr}`,
    );
    const answer = parses(measured.stdout, "measure");
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

        const replayed = runEntry(tokens.slice(1));
        assert.equal(
          replayed.status,
          0,
          `${label} exited ${String(replayed.status)}; stderr: ${replayed.stderr}`,
        );

        const redone = parses(replayed.stdout, entry.command);
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
