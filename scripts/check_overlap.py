#!/usr/bin/env python3
"""Ask a judge model whether a candidate artifact duplicates a published one.

Usage:
  scripts/check_overlap.py [--root PATH] [--response-file PATH] [--timeout SECONDS] <candidate>
  scripts/check_overlap.py [--root PATH] --added-since REF
  scripts/check_overlap.py [--root PATH] --all

The candidate is one of:
  skills/<category>/<name>/SKILL.md
  agents/<category>/<name>/AGENT.md
  mcps/<name>/README.md

Every other artifact in the repository becomes a question: none, partial, or
high overlap. The questions travel to a judge model in one request; the verdict
is the highest probability among the three options, never the choice label the
model returns.

Each question names the artifact it asks about, and the state repeats that
name, because a decision model may ignore the question id and answer a generic
question otherwise.

`--added-since REF` asks git which artifacts the commit added since REF and
judges each one against the rest; a push reports a ref of zeros for a branch
with no previous commit, which resolves to the parent of HEAD. `--all` ignores
git and judges every artifact against every other one: the audit of the state
as it is, at the cost of one request per artifact. One saved response covers
one candidate, so a test with several candidates passes a single path instead.

Configuration, read only when no response file is given:
  TOOLKIT_JUDGE_BASE_URL    base URL of the judge endpoint
  TOOLKIT_JUDGE_MODEL       model id the endpoint expects
  TOOLKIT_JUDGE_API_KEY     bearer token for the endpoint

Exit codes:
  0  every artifact was compared and none overlapped highly
  1  at least one high overlap
  2  usage, environment, transport or response error
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_repo import parse_frontmatter, split_list  # noqa: E402

CHOICES = ("none", "partial", "high")
ENV_VARS = ("TOOLKIT_JUDGE_BASE_URL", "TOOLKIT_JUDGE_MODEL", "TOOLKIT_JUDGE_API_KEY")
ACCEPTED_FORMS = (
    "skills/<category>/<name>/SKILL.md",
    "agents/<category>/<name>/AGENT.md",
    "mcps/<name>/README.md",
)
ALNUM = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
INSTRUCTIONS = (
    "Does the candidate cover the same work as this existing artifact? "
    "Answer high when a user would pick one of them and never the other."
)
CRITERIA = {
    "none": "Different work: a user could need both, and neither replaces the other.",
    "partial": "Adjacent work: overlapping trigger or subject, but each keeps a distinct job.",
    "high": (
        "Same work: one of them replaces the other; "
        "publishing both would duplicate or confuse routing."
    ),
}


class EvaluationError(Exception):
    """An answer, a transport or an environment problem that stops the check."""


def fail(message):
    print(f"check_overlap: {message}", file=sys.stderr)
    return 2


def sanitize(text):
    """Keep [A-Za-z0-9] and turn every other character into an underscore."""
    return "".join(char if char in ALNUM else "_" for char in text)


def body_lines(text):
    """Return the lines after the frontmatter block, or every line if there is none."""
    lines = text.splitlines()
    if lines and lines[0].strip() == "---":
        for index in range(1, len(lines)):
            if lines[index].strip() == "---":
                return lines[index + 1:]
    return lines


def headings(lines):
    """Level 2 and 3 headings of the body, without their markers."""
    found = []
    for line in lines:
        if line.startswith("### "):
            found.append(line[4:].strip())
        elif line.startswith("## "):
            found.append(line[3:].strip())
    return found


def first_paragraph_line(lines):
    """First non-empty line that is not a heading or an HTML comment."""
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("<!--"):
            continue
        return stripped
    return ""


def artifact_shape(root, path):
    """Return (kind, category, directory name) or None when the path is not an artifact."""
    try:
        relative = path.resolve().relative_to(root)
    except ValueError:
        return None
    parts = relative.parts
    if len(parts) == 4 and parts[0] == "skills" and parts[3] == "SKILL.md":
        return "skill", parts[1], parts[2]
    if len(parts) == 4 and parts[0] == "agents" and parts[3] == "AGENT.md":
        return "agent", parts[1], parts[2]
    if len(parts) == 3 and parts[0] == "mcps" and parts[2] == "README.md":
        return "mcp", "", parts[1]
    return None


def describe(root, path):
    """Read one artifact into the shape the judge sees, plus the resolved path."""
    shape = artifact_shape(root, path)
    kind, category, directory = shape
    text = path.read_text(encoding="utf-8")
    fields, _ = parse_frontmatter(text)
    fields = fields or {}
    lines = body_lines(text)
    description = fields.get("description", "")
    if kind == "mcp" or not description:
        description = first_paragraph_line(lines)
    entry = {
        "path": path.resolve(),
        "name": fields.get("name") or directory,
        "kind": kind,
        "category": category,
        "description": description,
        "headings": headings(lines),
    }
    if "skills" in fields:
        entry["declares_dependencies"] = split_list(fields["skills"])
    return entry


def collect(root):
    """Every artifact in the repository, sorted by name."""
    paths = []
    paths += sorted(root.glob("skills/*/*/SKILL.md"))
    paths += sorted(root.glob("agents/*/*/AGENT.md"))
    paths += sorted(root.glob("mcps/*/README.md"))
    entries = []
    for path in paths:
        if artifact_shape(root, path) is None:
            continue
        entries.append(describe(root, path))
    return entries


def payload(entry, reference=None):
    """The part of an entry that goes into the request body."""
    body = {
        "name": entry["name"],
        "kind": entry["kind"],
        "category": entry["category"],
        "description": entry["description"],
        "headings": entry["headings"],
    }
    if reference is not None:
        body["ref"] = reference
    if "declares_dependencies" in entry:
        body["declares_dependencies"] = entry["declares_dependencies"]
    return body


def question_ids(entries):
    """One unique question id per entry: overlap_<kind>_<name>, sanitized."""
    taken = set()
    ids = []
    for entry in entries:
        base = sanitize(f"overlap_{entry['kind']}_{entry['name']}")
        question_id = base
        suffix = 2
        while question_id in taken:
            question_id = f"{base}_{suffix}"
            suffix += 1
        taken.add(question_id)
        ids.append(question_id)
    return ids


def question(entry, reference):
    """One question, naming the artifact it asks about.

    A decision model that ignores the question id answers generically unless
    the artifact is spelled out in the instructions, and the state alone does
    not say which of its entries the question is about.
    """
    described = f"{entry['kind']} '{entry['name']}'"
    if entry["category"]:
        described += f" in the category '{entry['category']}'"
    text = f"{INSTRUCTIONS} The existing artifact is {reference}: {described}. {entry['description']}"
    if entry["headings"]:
        text += " Its sections: " + "; ".join(entry["headings"]) + "."
    return {"type": "choice", "instructions": text, "criteria": dict(CRITERIA)}


def request_body(model, candidate, existing, ids):
    refs = [f"artifact_{index}" for index in range(1, len(existing) + 1)]
    return {
        "model": model,
        "state": {
            "candidate": payload(candidate),
            "existing": [
                payload(entry, reference) for entry, reference in zip(existing, refs)
            ],
        },
        "questions": {
            question_id: question(entry, reference)
            for question_id, entry, reference in zip(ids, existing, refs)
        },
    }


def error_detail(error):
    """The detail field of an error response, or an empty string."""
    try:
        body = error.read().decode("utf-8", "replace")
    except OSError:
        return ""
    try:
        data = json.loads(body)
    except ValueError:
        return ""
    detail = data.get("detail") if isinstance(data, dict) else None
    if detail is None:
        return ""
    return str(detail)


def judge(body, base_url, api_key, timeout):
    """Send the request and return the raw response text."""
    url = base_url.rstrip("/") + "/v1/systemone"
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        detail = error_detail(error)
        suffix = f": {detail}" if detail else ""
        if error.code == 400:
            raise EvaluationError(f"the judge rejected the request (HTTP 400){suffix}")
        raise EvaluationError(f"the judge answered HTTP {error.code}{suffix}")
    except (urllib.error.URLError, OSError) as error:
        raise EvaluationError(f"cannot reach the judge: {error}")


def probabilities(answer, question_id):
    """The three probabilities of one answer, with missing keys read as zero."""
    if not isinstance(answer, dict):
        raise EvaluationError(f"the answer for {question_id} is not an object")
    raw = answer.get("probabilities")
    if not isinstance(raw, dict):
        raise EvaluationError(f"the answer for {question_id} has no probabilities object")
    if not any(choice in raw for choice in CHOICES):
        raise EvaluationError(
            f"the answer for {question_id} has none of {', '.join(CHOICES)}"
        )
    values = {}
    for choice in CHOICES:
        value = raw.get(choice, 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise EvaluationError(
                f"the probability for {choice} in {question_id} is not a number"
            )
        values[choice] = float(value)
    return values


def verdict(values):
    """The most probable option; an exact tie at the top counts as high."""
    ranked = sorted(CHOICES, key=lambda choice: values[choice], reverse=True)
    if values[ranked[0]] == values[ranked[1]]:
        return "high"
    return ranked[0]


def read_answers(payload_text, ids):
    """Parse the response and return one probability dict per question id."""
    try:
        data = json.loads(payload_text)
    except ValueError as error:
        raise EvaluationError(f"the response is not valid JSON: {error}")
    answers = data.get("answers") if isinstance(data, dict) else None
    if not isinstance(answers, dict):
        raise EvaluationError("the response has no answers object")
    values = []
    for question_id in ids:
        if question_id not in answers:
            raise EvaluationError(f"the response has no answer for {question_id}")
        values.append(probabilities(answers[question_id], question_id))
    return values, data


def report_metadata(data):
    """Print the extra blocks the endpoint returns, as it returns them.

    The usage, cost and energy blocks carry fields this check does not read, so
    they are printed whole instead of being picked apart by name.
    """
    for key in ("usage", "cost", "energy"):
        block = data.get(key)
        if isinstance(block, dict) and block:
            print(f"check_overlap: {key} {json.dumps(block, sort_keys=True)}")


def report(results):
    """Print one line per compared artifact, then the summary and the exit code."""
    for entry, values, _choice in results:
        print(
            f"check_overlap: {entry['kind']} {entry['name']}:"
            f" none {values['none']:.4f}"
            f" partial {values['partial']:.4f}"
            f" high {values['high']:.4f}"
        )

    partial = [item for item in results if item[2] == "partial"]
    high = [item for item in results if item[2] == "high"]
    if partial:
        print(f"check_overlap: {len(partial)} partial overlap(s)")
    if high:
        for entry, _values, _choice in high:
            print(f"check_overlap: high overlap with {entry['kind']} {entry['name']}")
        print(f"check_overlap: {len(high)} high overlap(s)")
        return 1
    print(f"check_overlap: ok ({len(results)} artifacts compared, no high overlap)")
    return 0


def added_candidates(root, ref):
    """The artifacts a commit added since ref, as resolved paths.

    A ref of zeros, which is what a push reports for a branch without a
    previous commit, resolves to the parent of HEAD.
    """
    base = "HEAD^" if set(ref) <= {"0"} else ref
    resolved = run_git(root, "rev-parse", "--verify", "--quiet", f"{base}^{{commit}}")
    if resolved.returncode != 0:
        raise EvaluationError(f"cannot resolve {ref!r} as a commit in {root}")
    diff = run_git(
        root,
        "diff",
        "--name-only",
        "--diff-filter=A",
        base,
        "HEAD",
        "--",
        "skills",
        "agents",
        "mcps",
    )
    if diff.returncode != 0:
        raise EvaluationError(f"git diff failed: {diff.stderr.strip()}")
    paths = []
    for line in diff.stdout.splitlines():
        path = (root / line.strip()).resolve()
        if path.is_file() and artifact_shape(root, path) is not None:
            paths.append(path)
    return sorted(paths)


def run_git(root, *arguments):
    try:
        return subprocess.run(
            ["git", "-C", str(root), *arguments], capture_output=True, text=True
        )
    except OSError as error:
        raise EvaluationError(f"cannot run git: {error}")


def evaluate(root, candidate_path, args):
    """Judge one candidate against the rest of the catalog and report it."""
    candidate = describe(root, candidate_path)
    existing = [entry for entry in collect(root) if entry["path"] != candidate_path]
    if not existing:
        print("check_overlap: nothing to compare against")
        return 0

    existing.sort(key=lambda entry: (entry["name"], entry["kind"]))
    ids = question_ids(existing)

    # The saved response is read before the environment is touched, so a run
    # with --response-file never opens a connection and needs no configuration.
    if args.response_file:
        try:
            payload_text = Path(args.response_file).read_text(encoding="utf-8")
        except OSError as error:
            return fail(f"cannot read the response file: {error}")
    else:
        missing = [name for name in ENV_VARS if not os.environ.get(name)]
        if missing:
            return fail(f"missing environment variable(s): {', '.join(missing)}")
        try:
            payload_text = judge(
                request_body(
                    os.environ["TOOLKIT_JUDGE_MODEL"], candidate, existing, ids
                ),
                os.environ["TOOLKIT_JUDGE_BASE_URL"],
                os.environ["TOOLKIT_JUDGE_API_KEY"],
                args.timeout,
            )
        except EvaluationError as error:
            return fail(str(error))

    try:
        answers, data = read_answers(payload_text, ids)
    except EvaluationError as error:
        return fail(str(error))

    report_metadata(data)

    results = [
        (entry, values, verdict(values)) for entry, values in zip(existing, answers)
    ]
    return report(results)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("candidate", nargs="?", help="artifact to evaluate")
    parser.add_argument(
        "--added-since",
        default=None,
        metavar="REF",
        help="evaluate every artifact the push added since REF",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="evaluate every artifact against every other one",
    )
    parser.add_argument(
        "--root", default=None, help="repository root (default: parent of this script)"
    )
    parser.add_argument(
        "--response-file", default=None, help="read a saved response instead of calling the judge"
    )
    parser.add_argument(
        "--timeout", type=float, default=120.0, help="request timeout in seconds (default: 120)"
    )
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    if not root.is_dir():
        return fail(f"not a directory: {args.root}")

    chosen = sum([bool(args.candidate), bool(args.added_since), args.all])
    if chosen != 1:
        return fail("pass one of: a candidate path, --added-since REF, or --all")

    forms = ", ".join(ACCEPTED_FORMS)
    if args.all:
        candidates = [entry["path"] for entry in collect(root)]
        if not candidates:
            print("check_overlap: no artifact to audit")
            return 0
    elif args.added_since:
        try:
            candidates = added_candidates(root, args.added_since)
        except EvaluationError as error:
            return fail(str(error))
        if not candidates:
            print(f"check_overlap: nothing added since {args.added_since}")
            return 0
    else:
        candidate_path = Path(args.candidate)
        if not candidate_path.is_absolute():
            candidate_path = root / candidate_path
        candidate_path = candidate_path.resolve()
        if not candidate_path.is_file():
            return fail(f"no such artifact: {args.candidate}; expected one of {forms}")
        if artifact_shape(root, candidate_path) is None:
            return fail(f"not an artifact path: {args.candidate}; expected one of {forms}")
        candidates = [candidate_path]

    if args.response_file and len(candidates) > 1:
        return fail("a saved response covers one candidate: pass a candidate path instead")

    status = 0
    for candidate_path in candidates:
        if len(candidates) > 1:
            print(f"check_overlap: candidate {candidate_path.relative_to(root).as_posix()}")
        status = max(status, evaluate(root, candidate_path, args))
    return status


if __name__ == "__main__":
    sys.exit(main())
