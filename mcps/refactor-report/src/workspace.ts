import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { Stats } from "node:fs";
import type { ErrorCode } from "./errors.ts";

// D2/M1: the root is process.cwd(), resolved once per entry and injected; the
// response layer echoes it as "." and never exposes the absolute path.
export const REPORTED_ROOT = ".";

export class WorkspaceError extends Error {
  readonly code: ErrorCode;
  readonly paths: string[] | undefined;

  constructor(code: ErrorCode, detail: string, paths?: string[]) {
    super(detail);
    this.name = "WorkspaceError";
    this.code = code;
    this.paths = paths;
  }
}

export type Workspace = {
  readonly root: string;
  listFiles(): Promise<string[]>;
  readText(relativePath: string): Promise<string>;
};

// R7: v1 measures TypeScript only and never claims JavaScript, Java or Scala.
const TYPESCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".tsx", ".mts", ".cts"]);

export function isMeasurablePath(relativePath: string): boolean {
  return TYPESCRIPT_EXTENSIONS.has(path.extname(relativePath));
}

function assertSupportedExtension(requested: string): void {
  if (!isMeasurablePath(requested)) {
    throw new WorkspaceError(
      "LANGUAGE_UNSUPPORTED",
      `only .ts, .tsx, .mts and .cts are measured; cannot read ${requested}`,
    );
  }
}

function isInsideRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function assertInsideRoot(root: string, candidate: string, detail: string): void {
  if (!isInsideRoot(root, candidate)) {
    throw new WorkspaceError("PATH_OUTSIDE_ROOT", detail);
  }
}

// A path that cannot be resolved is a read failure, not an escape: readText turns
// the missing file into FILE_UNREADABLE. Only a target outside the root is an escape.
async function resolveOrNull(candidate: string): Promise<string | null> {
  try {
    return await realpath(candidate);
  } catch {
    return null;
  }
}

async function readOrUnreadable(absolute: string, requested: string): Promise<string> {
  try {
    return await readFile(absolute, "utf8");
  } catch {
    throw new WorkspaceError("FILE_UNREADABLE", `cannot read ${requested}`);
  }
}

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(["node_modules", "dist", ".git"]);

async function statOrNull(candidate: string): Promise<Stats | null> {
  try {
    return await stat(candidate);
  } catch {
    return null;
  }
}

async function walkDirectory(
  root: string,
  absoluteDirectory: string,
  relativeDirectory: string,
  visited: Set<string>,
  files: string[],
): Promise<void> {
  const realDirectory = await resolveOrNull(absoluteDirectory);
  if (realDirectory === null || visited.has(realDirectory)) {
    return;
  }
  visited.add(realDirectory);

  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const relative = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
    const absolute = path.join(absoluteDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await resolveOrNull(absolute);
      if (target === null || !isInsideRoot(root, target)) {
        continue;
      }
    }
    // stat follows symlinks, so an entry is enumerated as the file or directory it points at.
    const info = await statOrNull(absolute);
    if (info === null) {
      continue;
    }
    if (info.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      await walkDirectory(root, absolute, relative, visited, files);
      continue;
    }
    if (info.isFile()) {
      files.push(relative);
    }
  }
}

export async function openWorkspace(root: string = process.cwd()): Promise<Workspace> {
  const resolvedRoot = await realpath(path.resolve(root));

  return {
    root: resolvedRoot,
    async listFiles(): Promise<string[]> {
      const files: string[] = [];
      await walkDirectory(resolvedRoot, resolvedRoot, "", new Set(), files);
      return files.sort();
    },
    async readText(relativePath: string): Promise<string> {
      if (path.isAbsolute(relativePath)) {
        throw new WorkspaceError(
          "PATH_OUTSIDE_ROOT",
          "workspace paths are relative to the root; an absolute path cannot be read",
        );
      }
      const candidate = path.resolve(resolvedRoot, relativePath);
      assertInsideRoot(
        resolvedRoot,
        candidate,
        `path escapes the workspace root: ${relativePath}`,
      );
      assertSupportedExtension(relativePath);
      const resolved = await resolveOrNull(candidate);
      if (resolved === null) {
        return readOrUnreadable(candidate, relativePath);
      }
      assertInsideRoot(
        resolvedRoot,
        resolved,
        `path resolves outside the workspace root: ${relativePath}`,
      );
      return readOrUnreadable(resolved, relativePath);
    },
  };
}
