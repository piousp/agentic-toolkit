#!/usr/bin/env python3
"""Validate artifact structure, frontmatter and declared dependencies.

Layout checked:
  skills/<category>/<name>/SKILL.md
  agents/<category>/<name>/AGENT.md

Usage:
  scripts/check_repo.py [--root PATH]
"""

import argparse
import re
import sys
from pathlib import Path

CATEGORY_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
FIELD_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*):(.*)$")
SKILL_REF_RE = re.compile(r"skill:([a-z0-9][a-z0-9-]*)")
BLOCK_MARKERS = {">", "|", ">-", "|-", ">+", "|+"}
MIN_DESCRIPTION = 20


def parse_frontmatter(text):
    """Return (fields, error). Handles plain scalars and folded blocks."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, "missing frontmatter block"
    end = None
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            end = index
            break
    if end is None:
        return None, "unterminated frontmatter block"

    raw = {}
    key = None
    for line in lines[1:end]:
        if not line.strip():
            continue
        match = FIELD_RE.match(line)
        if match:
            key = match.group(1)
            raw[key] = match.group(2).strip()
        elif key and line[:1].isspace():
            current = raw[key]
            if current in BLOCK_MARKERS:
                raw[key] = line.strip()
            else:
                raw[key] = (current + " " + line.strip()).strip()
        else:
            key = None

    fields = {}
    for key, value in raw.items():
        value = value.strip()
        if value in BLOCK_MARKERS:
            value = ""
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        fields[key] = " ".join(value.split())
    return fields, None


def split_list(value):
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    return [item.strip().strip("\"'") for item in value.split(",") if item.strip()]


def collect(root):
    skills = sorted(root.glob("skills/*/*/SKILL.md"))
    agents = sorted(root.glob("agents/*/*/AGENT.md"))
    return skills, agents


def validate(kind, paths, root, skill_names):
    errors = []
    seen = {}
    for path in paths:
        name_dir = path.parent.name
        category = path.parent.parent.name
        label = f"{kind} {path.relative_to(root)}"

        if not CATEGORY_RE.match(category):
            errors.append(f"{label}: invalid category directory {category!r}")

        fields, error = parse_frontmatter(path.read_text(encoding="utf-8"))
        if error:
            errors.append(f"{label}: {error}")
            continue

        name = fields.get("name", "")
        description = fields.get("description", "")

        if not name:
            errors.append(f"{label}: missing name")
        elif name != name_dir:
            errors.append(f"{label}: name {name!r} does not match directory {name_dir!r}")
        elif name in seen:
            errors.append(f"{label}: duplicate name {name!r}, already in {seen[name]}")
        else:
            seen[name] = str(path.relative_to(root))

        if not description:
            errors.append(f"{label}: missing description")
        elif len(description) < MIN_DESCRIPTION:
            errors.append(
                f"{label}: description too short to route on ({len(description)} chars)"
            )

        if kind == "agent":
            for dependency in split_list(fields.get("skills", "")):
                if dependency not in skill_names:
                    errors.append(
                        f"{label}: requires skill {dependency!r}, which this repository does not publish"
                    )
    return errors


def validate_references(kind, paths, root, skill_names):
    """Check the declared reference form: `skill:<name>`."""
    errors = []
    for path in paths:
        label = f"{kind} {path.relative_to(root)}"
        text = path.read_text(encoding="utf-8")
        for match in SKILL_REF_RE.finditer(text):
            name = match.group(1)
            if name not in skill_names:
                errors.append(
                    f"{label}: references skill:{name}, which this repository does not publish"
                )
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=None, help="repository root (default: parent of this script)")
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not root.is_dir():
        print(f"check_repo: not a directory: {root}", file=sys.stderr)
        return 2

    skills, agents = collect(root)
    skill_names = set()
    for path in skills:
        fields, _ = parse_frontmatter(path.read_text(encoding="utf-8"))
        if fields and fields.get("name"):
            skill_names.add(fields["name"])

    errors = validate("skill", skills, root, skill_names)
    errors += validate("agent", agents, root, skill_names)
    errors += validate_references("skill", skills, root, skill_names)
    errors += validate_references("agent", agents, root, skill_names)

    for error in errors:
        print(f"check_repo: {error}")
    if errors:
        print(f"check_repo: {len(errors)} problem(s)")
        return 1

    print(f"check_repo: ok ({len(skills)} skills, {len(agents)} agents)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
