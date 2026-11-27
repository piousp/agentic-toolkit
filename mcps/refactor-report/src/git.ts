import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ErrorCode } from "./errors.ts";
import { WorkspaceError } from "./workspace.ts";
import type { Workspace } from "./workspace.ts";

const execFileAsync = promisify(execFile);

// D11: rev-parse, diff and ls-files are the whole git surface this package
// spawns, and this module is the only place that spawns it. git status is
// excluded on purpose: it rewrites .git/index and would invalidate the read-only
// manifest the guard compares.
export type Git = {
  resolveCommit(base: string): Promise<string>;
  changedPaths(base: string): Promise<string[]>;
  deletedPaths(base: string): Promise<string[]>;
  untrackedPaths(): Promise<string[]>;
};

// Outside a git repository every subcommand fails with the same fatal message, so
// the message, not the exit code, is what separates NOT_A_GIT_REPOSITORY from a
// base the repository cannot resolve.
const NOT_A_REPOSITORY = /not a git repository/i;

function stderrOf(error: unknown): string {
  if (error === null || typeof error !== "object") {
    return "";
  }
  const failure = error as { stderr?: unknown; message?: unknown };
  if (typeof failure.stderr === "string" && failure.stderr !== "") {
    return failure.stderr;
  }
  return typeof failure.message === "string" ? failure.message : "";
}

async function runGit(root: string, args: readonly string[], failure: ErrorCode): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root });
    return stdout;
  } catch (error) {
    const stderr = stderrOf(error).trim();
    const code: ErrorCode = NOT_A_REPOSITORY.test(stderr) ? "NOT_A_GIT_REPOSITORY" : failure;
    throw new WorkspaceError(code, `git ${args.join(" ")} failed: ${stderr}`);
  }
}

// git prints one path per line; an empty listing is an empty string, not one
// empty path.
function lines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

async function resolveCommit(root: string, base: string): Promise<string> {
  const inside = await runGit(root, ["rev-parse", "--is-inside-work-tree"], "NOT_A_GIT_REPOSITORY");
  if (inside.trim() !== "true") {
    throw new WorkspaceError(
      "NOT_A_GIT_REPOSITORY",
      "the diff mode reads a git work tree and this root is not inside one",
    );
  }
  const commit = (
    await runGit(root, ["rev-parse", "--verify", `${base}^{commit}`], "BASE_UNRESOLVED")
  ).trim();
  if (commit === "") {
    throw new WorkspaceError("BASE_UNRESOLVED", `git cannot resolve ${base} to a commit`);
  }
  return commit;
}

export function createGit(workspace: Workspace): Git {
  const root = workspace.root;
  return {
    resolveCommit: (base: string) => resolveCommit(root, base),
    async changedPaths(base: string): Promise<string[]> {
      // ACMR and not D: a deleted path has nothing to measure, and the diff of
      // the working tree still reports the paths that exist.
      return lines(await runGit(root, ["diff", "--name-only", "--diff-filter=ACMR", base], "FILE_UNREADABLE"));
    },
    async deletedPaths(base: string): Promise<string[]> {
      // D10: a deletion is the one change with nothing left to measure, so it is
      // listed apart and never reaches the measured set.
      return lines(await runGit(root, ["diff", "--name-only", "--diff-filter=D", base], "FILE_UNREADABLE"));
    },
    async untrackedPaths(): Promise<string[]> {
      return lines(await runGit(root, ["ls-files", "--others", "--exclude-standard"], "FILE_UNREADABLE"));
    },
  };
}
