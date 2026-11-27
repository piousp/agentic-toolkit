# Installation

Artifacts install by copying or linking a directory into a harness. No package
manager, no build step, no dependency beyond the harness itself.

This page covers skills and agents. The harness prompt, its settings and the MCP
placeholders live in [`../harness/README.md`](../harness/README.md).

## Skills

A skill is a directory holding a `SKILL.md`. The reference harness discovers
them recursively, so one symlink installs a whole category:

```sh
ln -s "$PWD/skills/<category>" "$HOME/.pi/agent/skills/<category>"
```

Link a single skill the same way when the rest of the category is noise:

```sh
ln -s "$PWD/skills/<category>/<name>" "$HOME/.pi/agent/skills/<name>"
```

## Agents

The repository keeps agents under a category directory, while the harness looks
one level deep. `scripts/link_agents.sh` closes the gap:

```sh
scripts/link_agents.sh --dry-run   # print what would be linked
scripts/link_agents.sh             # link every agent into the harness directory
```

The script links `agents/<category>/<name>/` to
`$PI_CODING_AGENT_DIR/agents/<name>/`, so `references/`, `scripts/` and
`tests/` travel with the agent. It is a development helper, not an installer,
and it never deletes anything.

## Optional: checks before a push

`scripts/pre_push.sh` runs the six offline checks in one command and can be
installed as the pre-push hook:

```sh
ln -s ../../scripts/pre_push.sh .git/hooks/pre-push
```

CI remains the authority: the hook checks the tree as it is, not the index, and
a push can skip it with `--no-verify`.

The overlap check needs a decision model, so it runs in CI only. To run it by
hand, set `TOOLKIT_JUDGE_BASE_URL`, `TOOLKIT_JUDGE_MODEL` and
`TOOLKIT_JUDGE_API_KEY` first:

```sh
scripts/check_overlap.py skills/<category>/<name>/SKILL.md
```
