---
name: find-pi-session
description: >
  Locate the current pi session and its artifact directory from the variables
  pi exports. Use when a skill must write run artifacts next to the session, or
  when a session path has to be reported. [DO NOT] use to list past sessions, to
  read transcripts, or outside a pi session.
---

# find-pi-session

## Run

```bash
python3 scripts/find_pi_session.py            # print the artifact directory
python3 scripts/find_pi_session.py --json     # print every field
python3 scripts/find_pi_session.py --create   # create the directory if missing
python3 scripts/find_pi_session.py --require  # fail when it does not exist
```

## Rules

- [ALWAYS] run the bundled script instead of re-deriving the path. It reads
  `PI_SESSION_ID` and `PI_SESSION_FILE`; nothing else is authoritative.
- [ALWAYS] expect it to be read-only: a missing directory is reported, never
  created. `--create` is the only write it performs.
- [ALWAYS] parse `--json` when fields are needed; field names are stable.
- [NEVER] copy the artifact directory elsewhere. Read it in place.
- [NEVER] invent a path when the script exits `2`. Report that the session is
  unknown and stop.

## Exit codes

`0` resolved, `1` missing directory under `--require`, `2` not inside pi.

## Paths

- Persistent session: the session file's sibling, with `.files` where the file
  has `.jsonl`.
- Ephemeral session: `/tmp/pi/session/<PI_SESSION_ID>`.
