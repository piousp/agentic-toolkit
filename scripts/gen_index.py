#!/usr/bin/env python3
"""Regenerate the tables between the GENERATED markers in each index file.

Usage:
  scripts/gen_index.py            rewrite the tables
  scripts/gen_index.py --check    fail when the tables are stale
"""

import argparse
import re
import sys
from pathlib import Path

BEGIN = "<!-- GENERATED:BEGIN -->"
END = "<!-- GENERATED:END -->"
# Markers are matched as whole lines: a file may talk about the markers in
# prose without that mention becoming the region.
BEGIN_LINE = re.compile(r"^" + re.escape(BEGIN) + r"[ \t]*$", re.MULTILINE)
END_LINE = re.compile(r"^" + re.escape(END) + r"[ \t]*$", re.MULTILINE)
MAX_DESCRIPTION = 160

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_repo import parse_frontmatter  # noqa: E402


def collect(root):
    entries = {"skill": [], "agent": []}
    for kind, pattern in (("skill", "skills/*/*/SKILL.md"), ("agent", "agents/*/*/AGENT.md")):
        for path in sorted(root.glob(pattern)):
            fields, _ = parse_frontmatter(path.read_text(encoding="utf-8"))
            fields = fields or {}
            entries[kind].append(
                {
                    "name": fields.get("name") or path.parent.name,
                    "category": path.parent.parent.name,
                    "description": clean(fields.get("description", "")),
                }
            )
    return entries


def clean(text):
    text = " ".join(text.split()).replace("|", "\\|")
    if len(text) > MAX_DESCRIPTION:
        text = text[: MAX_DESCRIPTION - 3].rstrip() + "..."
    return text or "-"


def table(headers, rows):
    if not rows:
        return "_Nothing yet._"
    lines = ["| " + " | ".join(headers) + " |"]
    lines.append("|" + "|".join("---" for _ in headers) + "|")
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def render_overview(entries):
    categories = sorted({e["category"] for group in entries.values() for e in group})
    rows = []
    for category in categories:
        skills = sum(1 for e in entries["skill"] if e["category"] == category)
        agents = sum(1 for e in entries["agent"] if e["category"] == category)
        rows.append([f"`{category}`", str(agents), str(skills)])
    return table(["Category", "Agents", "Skills"], rows) + "\n"


def render_skills(entries):
    rows = [
        [f"[`{e['name']}`](./{e['category']}/{e['name']}/SKILL.md)", f"`{e['category']}`", e["description"]]
        for e in entries["skill"]
    ]
    return table(["Skill", "Category", "What it does"], rows) + "\n"


def render_agents(entries):
    rows = [
        [f"[`{e['name']}`](./{e['category']}/{e['name']}/AGENT.md)", f"`{e['category']}`", e["description"]]
        for e in entries["agent"]
    ]
    return table(["Agent", "Category", "What it does"], rows) + "\n"


def render_tree(entries):
    lines = []
    for kind, prefix in (("agent", "agents"), ("skill", "skills")):
        for entry in entries[kind]:
            suffix = "AGENT.md" if kind == "agent" else "SKILL.md"
            lines.append(f"- `{prefix}/{entry['category']}/{entry['name']}/{suffix}`")
    if not lines:
        return "_Nothing yet._\n"
    return "\n".join(lines) + "\n"


TARGETS = {
    "README.md": render_overview,
    "AGENTS.md": render_tree,
    "skills/README.md": render_skills,
    "agents/README.md": render_agents,
}


def replace_region(text, body):
    starts = list(BEGIN_LINE.finditer(text))
    if len(starts) != 1:
        return None
    start = starts[0]
    end = END_LINE.search(text, start.end())
    if end is None:
        return None
    return text[: start.end()] + "\n" + body + text[end.start():]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail on drift instead of writing")
    parser.add_argument("--root", default=None)
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    entries = collect(root)
    stale = []

    for relative, render in TARGETS.items():
        path = root / relative
        if not path.is_file():
            print(f"gen_index: missing file {relative}", file=sys.stderr)
            return 2
        current = path.read_text(encoding="utf-8")
        updated = replace_region(current, render(entries))
        if updated is None:
            print(f"gen_index: no GENERATED markers in {relative}", file=sys.stderr)
            return 2
        if updated != current:
            stale.append(relative)
            if not args.check:
                path.write_text(updated, encoding="utf-8")

    if args.check:
        if stale:
            for relative in stale:
                print(f"gen_index: stale index in {relative}")
            print("gen_index: run scripts/gen_index.py")
            return 1
        print("gen_index: up to date")
        return 0

    if stale:
        print(f"gen_index: updated {', '.join(stale)}")
    else:
        print("gen_index: nothing to update")
    return 0


if __name__ == "__main__":
    sys.exit(main())
