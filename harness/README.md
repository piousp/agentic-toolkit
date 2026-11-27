# Harness wiring

The files that configure a harness, as opposed to the artifacts in `skills/`,
`agents/` and `mcps/`. These install into the harness agent directory, not into
a project.

| File here | Installs as | How |
|---|---|---|
| `PROMPT.md` | `<agent-dir>/AGENTS.md` | symlink |
| `PROMPT.es.md` | `<agent-dir>/AGENTS.md` | symlink, same target, Spanish |
| `settings.example.json` | `<agent-dir>/settings.json` | copy and edit by hand |
| `mcp.example.json` | `<agent-dir>/mcp.json` | copy and edit by hand |

The agent directory is `~/.pi/agent` by default and moves with
`PI_CODING_AGENT_DIR`.

```sh
target="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

ln -s "$PWD/harness/PROMPT.md" "$target/AGENTS.md"        # English
ln -s "$PWD/harness/PROMPT.es.md" "$target/AGENTS.md"     # Spanish: pick one

cp harness/settings.example.json "$target/settings.json"
cp harness/mcp.example.json "$target/mcp.json"
```

Pick one prompt, not both: they are the same file in two languages, and the
harness reads one path. Run `/reload` after replacing it.

Model choices stay out of the artifacts on purpose. They depend on the account,
the budget and the task, so they belong in `settings.json`, filled in by hand.

To install the artifacts instead, see [`../docs/installation.md`](../docs/installation.md).

## No layering

The harness loads one instructions file per directory. `AGENTS.override.md`
replaces `AGENTS.md` in the same directory; it does not append to it. There is
no additive overlay at this level, so private rules go in the same file or in a
project-level one, never in a second user-level file.

The harness also reads `<agent-dir>/APPEND_SYSTEM.md`, which adds instructions
to its own system prompt, and `<agent-dir>/SYSTEM.md`, which replaces it. This
directory targets `AGENTS.md`: the portable location, and the one file that
works the same across harnesses.

## This prompt is opinionated

`PROMPT.md` is the author's own working prompt, published as-is. Two
consequences:

- It requires confirmation before every edit of an existing file, even when the
  request already names the edit. Most instructions files do not. For the
  conventional behavior, delete the `Changing state` section and leave
  `Non-negotiables` saying "editing an existing file the user did not ask for".
- It declares the coordinator role outright, and conditions the routing of work
  on subagents being available. Without them, the same rules apply to direct
  work.

Nothing else in it depends on a particular harness, provider or account.
