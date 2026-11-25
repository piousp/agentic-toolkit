#!/usr/bin/env python3
"""Check that the two harness prompts are mirrors of each other.

`harness/PROMPT.md` and `harness/PROMPT.es.md` are the same prompt in two
languages, so their structure has to match: the same `## ` sections, in the
same order, with the same number of rules (`- ` lines) and the same number of
`[ALWAYS]` and `[NEVER]` occurrences in each. Markers are counted, not lines:
a single line may carry two of them.

The limit: this check reads structure only. Titles, wording and content are
not compared, because a translation translates them. A section whose text
drifted while its counts stayed put passes here.

The preamble before the first `## ` heading is compared as section 0 only when
one of the two files carries a rule or a marker there.

Usage:
  scripts/check_mirror.py [--root PATH] [--en PATH] [--es PATH]
"""

import argparse
import sys
from pathlib import Path

SECTION = "## "
PREAMBLE = "(preamble)"
MARKERS = ("[ALWAYS]", "[NEVER]")


def split_sections(text):
    """Return [(title, lines)] with the preamble first."""
    sections = [(PREAMBLE, [])]
    for line in text.splitlines():
        if line.startswith(SECTION):
            sections.append((line[len(SECTION):].strip(), []))
        else:
            sections[-1][1].append(line)
    return sections


def counting(lines):
    """Return the counters of one section: rules and markers."""
    counts = {"rules": sum(1 for line in lines if line.startswith("- "))}
    for marker in MARKERS:
        counts[marker] = sum(line.count(marker) for line in lines)
    return counts


def render(counts):
    values = [f"rules={counts['rules']}"]
    values += [f"{marker}={counts[marker]}" for marker in MARKERS]
    return ", ".join(values)


def has_content(counts):
    """True when a section carries a rule or a marker."""
    return counts["rules"] > 0 or any(counts[marker] for marker in MARKERS)


def compare(en_sections, es_sections):
    problems = []
    if len(en_sections) != len(es_sections):
        problems.append(
            f"section count differs: en {len(en_sections)}, es {len(es_sections)}"
        )
    for position in range(min(len(en_sections), len(es_sections))):
        en_title, en_lines = en_sections[position]
        es_title, es_lines = es_sections[position]
        en_counts = counting(en_lines)
        es_counts = counting(es_lines)
        if en_counts != es_counts:
            problems.append(
                f"section {position} ({en_title} / {es_title}): "
                f"en {render(en_counts)}; es {render(es_counts)}"
            )
    return problems


def load(path):
    return split_sections(path.read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=None, help="repository root (default: parent of this script)")
    parser.add_argument("--en", default=None, help="English prompt (default: harness/PROMPT.md)")
    parser.add_argument("--es", default=None, help="Spanish prompt (default: harness/PROMPT.es.md)")
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not root.is_dir():
        print(f"check_mirror: not a directory: {root}", file=sys.stderr)
        return 2

    en_path = Path(args.en) if args.en else root / "harness" / "PROMPT.md"
    es_path = Path(args.es) if args.es else root / "harness" / "PROMPT.es.md"
    for path in (en_path, es_path):
        if not path.is_file():
            print(f"check_mirror: not a file: {path}", file=sys.stderr)
            return 2

    en_sections = load(en_path)
    es_sections = load(es_path)
    en_preamble = counting(en_sections[0][1])
    es_preamble = counting(es_sections[0][1])
    if not has_content(en_preamble) and not has_content(es_preamble):
        en_sections, es_sections = en_sections[1:], es_sections[1:]

    problems = compare(en_sections, es_sections)
    for problem in problems:
        print(f"check_mirror: {problem}")
    if problems:
        print(f"check_mirror: {len(problems)} problem(s)")
        return 1

    print(f"check_mirror: ok ({len(en_sections)} sections)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
