#!/usr/bin/env python3
"""Check that every relative link and image in a Markdown file exists.

A link resolves against the directory of the file that holds it. The fragment
is dropped before resolving, so `KISS.md#a-heading` checks `KISS.md`.

Ignored: absolute URLs (`http://`, `https://`, `mailto:`), fragments alone,
site-absolute paths (a leading slash, which depends on a host), and every link
inside a fenced code block or an inline code span. The fixtures under
`tests/fixtures/` are skipped by default: they hold broken links on purpose.
Installed dependencies are skipped too: a package's own README links files the
package does not ship, and no committed file points there.

Usage:
  scripts/check_links.py [--root PATH]
"""

import argparse
import re
import sys
from pathlib import Path

LINK_RE = re.compile(r"!?\[[^\]]*\]\(\s*(?:<([^>]*)>|([^)\s]+))")
FENCE = ("`" * 3, "~" * 3)
SKIP_URLS = ("http://", "https://", "mailto:", "#", "/")
SKIP_PREFIX = "tests/fixtures/"


def mask(text):
    """Return `text` with code blocks and code spans blanked out, length kept.

    Characters are replaced by spaces and newlines are kept, so an offset in
    the masked text is an offset in the original one.
    """
    lines = []
    fence = None
    for line in text.splitlines():
        stripped = line.lstrip()
        if fence is None and stripped[:3] in FENCE:
            fence = stripped[:3]
        elif fence is not None and stripped.startswith(fence):
            fence = None
        if fence is not None or stripped[:3] in FENCE:
            lines.append(" " * len(line))
            continue
        lines.append(re.sub(r"`[^`]*`", lambda match: " " * len(match.group()), line))
    return "\n".join(lines)


def check_file(path, root):
    """Return the problems of one file, as (relative path, line, target)."""
    problems = []
    relative = path.relative_to(root).as_posix()
    masked = mask(path.read_text(encoding="utf-8"))
    count = 0
    for match in LINK_RE.finditer(masked):
        target = match.group(1) if match.group(1) is not None else match.group(2)
        if target.startswith(SKIP_URLS):
            continue
        bare = target.split("#", 1)[0]
        if not bare:
            continue
        count += 1
        if not (path.parent / bare).exists():
            line = masked.count("\n", 0, match.start()) + 1
            problems.append((relative, line, target))
    return problems, count


def collect(root):
    files = []
    for path in sorted(root.rglob("*.md")):
        relative = path.relative_to(root).as_posix()
        if relative.startswith(SKIP_PREFIX) or ".git/" in relative or "node_modules/" in relative:
            continue
        files.append(path)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=None, help="repository root (default: parent of this script)")
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not root.is_dir():
        print(f"check_links: not a directory: {root}", file=sys.stderr)
        return 2

    files = collect(root)
    problems = []
    links = 0
    for path in files:
        found, count = check_file(path, root)
        problems += found
        links += count

    for relative, line, target in problems:
        print(f"check_links: {relative}:{line}: {target}")
    if problems:
        print(f"check_links: {len(problems)} problem(s)")
        return 1

    print(f"check_links: ok ({len(files)} files, {links} links)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
