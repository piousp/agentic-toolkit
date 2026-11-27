# agentic-toolkit

Skills, agents and MCP servers for coding agents, collected from daily use
rather than designed on a whiteboard.

A skill changes how a model handles one kind of task. An agent carries a task
from start to finish, with its own prompt, tools and turn limits. An MCP server
gives the agent a tool it did not have. The three stay apart because they do
different jobs; an artifact that drifts into another's job gets moved or cut.

Portability is the constraint behind every other decision. Plain Markdown,
relative paths, no account-bound model ids, no personal detail. An artifact
that needs one specific machine does not belong in the catalog.

Start with `skills/` when the model keeps getting one kind of judgment wrong.
Start with `agents/` when the work is a task to delegate whole.

## Requirements

A harness that reads `AGENTS.md` and skill directories. Pi is the reference;
any harness reading `skills/<name>/SKILL.md` or a directory-level `AGENTS.md`
works too. `python3` 3.9 or newer runs the repository checks.

## What is here

<!-- GENERATED:BEGIN -->
| Category | Agents | Skills |
|---|---|---|
| `coding` | 3 | 2 |
| `general` | 2 | 2 |
| `pi-tooling` | 0 | 1 |
| `research` | 2 | 0 |
| `writing` | 0 | 1 |
<!-- GENERATED:END -->

## Install

Copy an artifact into the harness, or link it. [`docs/installation.md`](docs/installation.md)
holds the commands for skills and agents; the harness prompt and its settings
are in [`harness/README.md`](harness/README.md).

## Contributing

Read [`docs/conventions.md`](docs/conventions.md) before adding an artifact, and
[`docs/roadmap.md`](docs/roadmap.md) before proposing one.

## License

MIT. See [`LICENSE`](LICENSE).
