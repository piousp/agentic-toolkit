#!/usr/bin/env python3
"""Locate the current pi session and its artifact directory. Read-only.

pi exports two variables:

  PI_SESSION_ID    the current session id
  PI_SESSION_FILE  absolute path to the session JSONL (empty or unset when the
                   session is ephemeral)

The artifact directory is the session file's sibling with the extension
replaced: `<name>.jsonl` -> `<name>.files`. An ephemeral session has no file,
so its artifacts live under `/tmp/pi/session/<id>`.

Usage:
  find_pi_session.py                 print the artifact directory
  find_pi_session.py --json          print every field as JSON
  find_pi_session.py --create        create the artifact directory if missing
  find_pi_session.py --require       exit 1 when the directory does not exist

Exit codes: 0 resolved, 1 missing directory under --require, 2 not inside pi.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

EPHEMERAL_ROOT = Path("/tmp/pi/session")


def resolve(session_file: str | None, session_id: str | None) -> dict[str, object]:
    """Map the environment to the session's locations. Pure: no filesystem writes."""
    if session_file:
        path = Path(session_file)
        return {
            "session_id": session_id or path.stem,
            "session_file": str(path),
            "storage_dir": str(path.parent),
            "artifacts_dir": str(path.parent / (path.stem + ".files")),
            "ephemeral": False,
        }
    if session_id:
        return {
            "session_id": session_id,
            "session_file": None,
            "storage_dir": str(EPHEMERAL_ROOT),
            "artifacts_dir": str(EPHEMERAL_ROOT / session_id),
            "ephemeral": True,
        }
    raise LookupError(
        "PI_SESSION_FILE and PI_SESSION_ID are both unset: not running inside pi"
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Locate the current pi session.")
    parser.add_argument("--json", action="store_true", help="print every field as JSON")
    parser.add_argument("--create", action="store_true", help="create the artifact directory")
    parser.add_argument("--require", action="store_true", help="exit 1 when the directory is missing")
    args = parser.parse_args(argv)

    session_file = os.environ.get("PI_SESSION_FILE") or None
    session_id = os.environ.get("PI_SESSION_ID") or None

    try:
        info = resolve(session_file, session_id)
    except LookupError as error:
        print(f"find_pi_session: {error}", file=sys.stderr)
        return 2

    artifacts = Path(str(info["artifacts_dir"]))
    if args.create:
        artifacts.mkdir(parents=True, exist_ok=True)
    info["artifacts_exists"] = artifacts.is_dir()

    if args.json:
        print(json.dumps(info, indent=2, sort_keys=True))
    else:
        print(info["artifacts_dir"])

    if args.require and not info["artifacts_exists"]:
        print(f"find_pi_session: missing {artifacts}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
