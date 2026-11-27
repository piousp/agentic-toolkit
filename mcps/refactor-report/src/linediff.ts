// R5: a preview reports both the ranges of the text a caller holds and the diff
// that renders them, so the two come out of one walk over the two texts and never
// out of two algorithms that could disagree about which line changed.

export type LineRange = {
  readonly start_line: number;
  readonly end_line: number;
};

export type LineDiff = {
  readonly ranges: readonly LineRange[];
  readonly added: number;
  readonly removed: number;
  readonly diff: string;
};

// The context a hunk keeps around a change: enough for a reader to place the change
// in the file, short of sending the whole file back.
const CONTEXT_LINES = 3;

// The longest-common-subsequence table costs one cell per pair of lines. A file big
// enough to make that table the largest object of the process is reported as one
// replaced block instead: the answer stays honest about what changed and the
// process stays bounded.
const MAX_TABLE_CELLS = 4_000_000;

const PREFIX: Readonly<Record<Op["kind"], string>> = {
  context: " ",
  removed: "-",
  added: "+",
};

type Op = {
  readonly kind: "context" | "removed" | "added";
  readonly text: string;
  /** The 1-based line of the original text the op sits at or before. */
  readonly oldLine: number;
  /** The 1-based line of the transformed text the op sits at or before. */
  readonly newLine: number;
};

// An empty text has no line and a trailing newline does not open one more, which is
// the count LOC reports for the same bytes. CRLF is normalised so a line ending
// alone is never rendered as a change.
function linesOf(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized === "") {
    return [];
  }
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function op(kind: Op["kind"], text: string, oldLine: number, newLine: number): Op {
  return { kind, text, oldLine, newLine };
}

// The ops of the shortest edit script between the two texts, or null when the table
// they need is above the bound this module keeps.
function commonOps(before: readonly string[], after: readonly string[]): Op[] | null {
  const rows = before.length + 1;
  const columns = after.length + 1;
  if (rows * columns > MAX_TABLE_CELLS) {
    return null;
  }

  const table = new Uint32Array(rows * columns);
  const cell = (row: number, column: number): number => table[row * columns + column] ?? 0;
  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      table[row * columns + column] =
        before[row] === after[column]
          ? cell(row + 1, column + 1) + 1
          : Math.max(cell(row + 1, column), cell(row, column + 1));
    }
  }

  const ops: Op[] = [];
  let row = 0;
  let column = 0;
  while (row < before.length && column < after.length) {
    if (before[row] === after[column]) {
      ops.push(op("context", before[row] ?? "", row + 1, column + 1));
      row += 1;
      column += 1;
      continue;
    }
    // A tie is read as a removal first, so the two texts never produce two
    // renderings of the same pair: the answer of a run is the answer of any run.
    if (cell(row + 1, column) >= cell(row, column + 1)) {
      ops.push(op("removed", before[row] ?? "", row + 1, column + 1));
      row += 1;
      continue;
    }
    ops.push(op("added", after[column] ?? "", row + 1, column + 1));
    column += 1;
  }
  while (row < before.length) {
    ops.push(op("removed", before[row] ?? "", row + 1, column + 1));
    row += 1;
  }
  while (column < after.length) {
    ops.push(op("added", after[column] ?? "", row + 1, column + 1));
    column += 1;
  }
  return ops;
}

// The bounded reading of the same change: the lines the two texts share at the head
// and at the tail are kept, and everything between them is one replaced block.
function replacedBlockOps(before: readonly string[], after: readonly string[]): Op[] {
  const ops: Op[] = [];
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  for (let at = 0; at < prefix; at += 1) {
    ops.push(op("context", before[at] ?? "", at + 1, at + 1));
  }
  const oldMiddleEnd = before.length - suffix;
  for (let at = prefix; at < oldMiddleEnd; at += 1) {
    ops.push(op("removed", before[at] ?? "", at + 1, prefix + 1));
  }
  const newMiddleEnd = after.length - suffix;
  for (let at = prefix; at < newMiddleEnd; at += 1) {
    ops.push(op("added", after[at] ?? "", oldMiddleEnd + 1, at + 1));
  }
  for (let at = 0; at < suffix; at += 1) {
    ops.push(op("context", after[newMiddleEnd + at] ?? "", oldMiddleEnd + at + 1, newMiddleEnd + at + 1));
  }
  return ops;
}

// A range is one run of the original text a change touches: the lines a change
// removed, and for a change that only inserts, the line the insertion lands before.
// The runs are ranges of the text the caller holds, never of the transformed one.
function rangesOf(ops: readonly Op[]): LineRange[] {
  const ranges: LineRange[] = [];
  let start: number | null = null;
  let end = 0;
  for (const current of ops) {
    if (current.kind === "context") {
      if (start !== null) {
        ranges.push({ start_line: start, end_line: end });
        start = null;
      }
      continue;
    }
    if (start === null) {
      start = current.oldLine;
      end = current.oldLine;
      continue;
    }
    if (current.kind === "removed") {
      end = current.oldLine;
    }
  }
  if (start !== null) {
    ranges.push({ start_line: start, end_line: end });
  }
  return ranges;
}

// Two changed runs closer than twice the context belong to one hunk, so a rendering
// never splits a change in two to repeat the lines between them.
function hunksOf(ops: readonly Op[]): readonly (readonly Op[])[] {
  const changed = ops.map((current) => current.kind !== "context");
  const hunks: (readonly Op[])[] = [];
  let at = 0;
  while (at < ops.length) {
    if (changed[at] !== true) {
      at += 1;
      continue;
    }
    let last = at;
    let scan = at;
    while (scan < ops.length) {
      if (changed[scan] === true) {
        last = scan;
        scan += 1;
        continue;
      }
      let run = 0;
      let next = scan;
      while (next < ops.length && changed[next] !== true) {
        run += 1;
        next += 1;
      }
      if (next < ops.length && run <= 2 * CONTEXT_LINES) {
        scan = next;
        continue;
      }
      break;
    }
    const from = Math.max(0, at - CONTEXT_LINES);
    const to = Math.min(ops.length, last + CONTEXT_LINES + 1);
    hunks.push(ops.slice(from, to));
    at = to;
  }
  return hunks;
}

// The unified spelling of a hunk: one header naming the line ranges of both texts,
// then the lines themselves with the prefix of their kind.
function hunkText(hunk: readonly Op[]): string {
  const first = hunk[0];
  const oldLines = hunk
    .filter((current) => current.kind !== "added")
    .map((current) => current.oldLine);
  const newLines = hunk
    .filter((current) => current.kind !== "removed")
    .map((current) => current.newLine);
  const oldStart = oldLines[0] ?? first?.oldLine ?? 1;
  const newStart = newLines[0] ?? first?.newLine ?? 1;
  const lines = [`@@ -${oldStart},${oldLines.length} +${newStart},${newLines.length} @@`];
  for (const current of hunk) {
    lines.push(`${PREFIX[current.kind]}${current.text}`);
  }
  return lines.join("\n");
}

export function lineDiff(before: string, after: string): LineDiff {
  const oldLines = linesOf(before);
  const newLines = linesOf(after);
  const ops = commonOps(oldLines, newLines) ?? replacedBlockOps(oldLines, newLines);

  return {
    ranges: rangesOf(ops),
    added: ops.filter((current) => current.kind === "added").length,
    removed: ops.filter((current) => current.kind === "removed").length,
    diff: hunksOf(ops)
      .map((hunk) => hunkText(hunk))
      .join("\n"),
  };
}

// The rendered size of a diff is what a reader receives, which is what the ceiling
// of the answer counts: an empty rendering is no line at all.
export function renderedLineCount(diff: string): number {
  return diff === "" ? 0 : diff.split("\n").length;
}
