#!/usr/bin/env python3
"""Validate CHANGELOG.md against the changelog rules in AGENTS.md.

Rules:
  - At least one `## YYYY-MM-DD` block. Dates are valid, strictly descending
    and appear once each.
  - Every date block holds at least one section.
  - Sections are Added, Changed, Fixed and Removed, in that order, once each.
  - Every section holds at least one entry.
  - An entry is one line and starts with its paths in backticks, then a colon:
    a dash, a backticked path, a colon and the description.
  - After the first date block, every non-empty line is a heading, a section
    heading or an entry.

Prose before the first date block is not validated, and the `# Changelog`
title is optional, so a file may open with a line of introduction. The date
is not compared with today: the clock of a CI runner is not a rule.

Usage:
  scripts/check_changelog.py [--root PATH]
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path

DATE_HEADING = "## "
SECTION_HEADING = "### "
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Path first: one or more backticked paths, separated by ", " or " and ",
# then a colon and the description.
ENTRY_RE = re.compile(r"^- (`[^`]+`(?:, `[^`]+`| and `[^`]+`)*):\s+\S")
SECTIONS = ["Added", "Changed", "Fixed", "Removed"]


def check_dates(lines, marks):
    """Validate the date headings in order. Return list of (line, message)."""
    problems = []
    previous = None
    for index in marks:
        raw = lines[index][len(DATE_HEADING):].strip()
        number = index + 1
        if not DATE_RE.match(raw):
            problems.append((number, f"heading is not a date: {raw!r}"))
            continue
        try:
            value = date.fromisoformat(raw)
        except ValueError:
            problems.append((number, f"heading is not a valid date: {raw!r}"))
            continue
        if previous is not None:
            if value == previous:
                problems.append((number, f"date repeated: {raw}"))
            elif value > previous:
                problems.append((number, f"date out of order: {raw} is newer than the block above"))
        previous = value
    return problems


def check_sections(block, base):
    """Validate the sections and entries of one date block.

    `block` is the list of body lines, `base` the line number of its first line.
    """
    problems = []
    sections = [(offset, line[len(SECTION_HEADING):].strip())
                for offset, line in enumerate(block) if line.startswith(SECTION_HEADING)]
    if not sections:
        problems.append((base - 2, "date block has no section"))

    last = -1
    seen = set()
    for offset, title in sections:
        number = base + offset
        if title not in SECTIONS:
            problems.append((number, f"section not allowed: {title!r}"))
            continue
        position = SECTIONS.index(title)
        if title in seen:
            problems.append((number, f"section repeated: {title!r}"))
        elif position < last:
            problems.append((number, f"section out of order: {title!r}"))
        last = max(last, position)
        seen.add(title)

    # One entry per change: a section without an entry is dead weight.
    bounds = [offset for offset, _ in sections] + [len(block)]
    for index in range(len(sections)):
        start, end = bounds[index], bounds[index + 1]
        if not any(line.startswith("- ") for line in block[start + 1:end]):
            number = base + sections[index][0]
            problems.append((number, f"section has no entry: {sections[index][1]!r}"))

    for offset, line in enumerate(block):
        number = base + offset
        if not line.strip() or line.startswith(SECTION_HEADING):
            continue
        if not line.startswith("- "):
            problems.append((number, f"line is not a one-line entry: {line.strip()!r}"))
        elif not ENTRY_RE.match(line):
            problems.append((number, f"entry does not start with a path: {line.strip()!r}"))
    return problems


def validate(text):
    lines = text.splitlines()
    marks = [index for index, line in enumerate(lines) if line.startswith(DATE_HEADING)]
    if not marks:
        return [(1, "no date block, expected a heading like ## 2000-01-01")]

    problems = check_dates(lines, marks)
    bounds = marks[1:] + [len(lines)]
    for mark, end in zip(marks, bounds):
        problems += check_sections(lines[mark + 1:end], mark + 2)
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=None, help="repository root (default: parent of this script)")
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not root.is_dir():
        print(f"check_changelog: not a directory: {root}", file=sys.stderr)
        return 2

    path = root / "CHANGELOG.md"
    if not path.is_file():
        print("check_changelog: CHANGELOG.md:1: file not found")
        print("check_changelog: 1 problem(s)")
        return 1

    text = path.read_text(encoding="utf-8")
    problems = validate(text)
    for number, message in problems:
        print(f"check_changelog: CHANGELOG.md:{number}: {message}")
    if problems:
        print(f"check_changelog: {len(problems)} problem(s)")
        return 1

    # Count only what the check reads: date blocks and their entries.
    lines = text.splitlines()
    first = next(index for index, line in enumerate(lines) if line.startswith(DATE_HEADING))
    blocks = sum(1 for line in lines if line.startswith(DATE_HEADING))
    entries = sum(1 for line in lines[first:] if line.startswith("- "))
    print(f"check_changelog: ok ({blocks} blocks, {entries} entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
