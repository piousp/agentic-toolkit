# agentic-toolkit

An opinionated collection of skills, agents and MCP servers for coding agents. Pi is the reference harness; any harness that reads `skills/<name>/SKILL.md` or a directory-level `AGENTS.md` works too.

Every artifact here is meant to be copied or linked into a harness and used as-is: relative paths only, no machine state, no personal data, no pinned provider. Content that cannot meet that rule stays out of this repository.

## Requirements

- A harness that reads `AGENTS.md` and skill directories. Pi is the reference.
- `python3` 3.9 or newer for the repository checks.

## Install

Skills are directories holding a `SKILL.md`, and pi discovers them recursively, so a whole category can be linked at once:

```sh
ln -s "$PWD/skills/<category>" "$HOME/.pi/agent/skills/<category>"
```

Agents are discovered one level deep (`agents/<name>.md` or `agents/<name>/AGENT.md`) while this repository keeps them under a category directory. Until the installer exists (see `docs/roadmap.md`), flatten one level with symlinks:

```sh
scripts/link_agents.sh --dry-run   # print what would be linked
scripts/link_agents.sh             # link every agent into the harness directory
```

The script links `agents/<category>/<name>/` to `$PI_CODING_AGENT_DIR/agents/<name>/`, so `references/`, `scripts/` and `tests/` travel with the agent. It is a development helper, not the installer, and it never deletes anything.

System instructions and harness configuration are in `harness/`: the prompt installs as the agent directory's `AGENTS.md`, and the two example files hold the settings and MCP placeholders. See `harness/README.md` for the commands.

Per-agent model choices are not part of an artifact: they depend on the account, the budget and the task. Start from `harness/settings.example.json` and fill in the models the harness actually offers.

## Layout

```text
skills/<category>/<name>/SKILL.md     skill; scripts, references, assets live beside it
agents/<category>/<name>/AGENT.md     agent; references, scripts, tests live beside it
mcps/<name>/                          MCP servers authored here
harness/PROMPT.md                     system instructions; installs as <agent-dir>/AGENTS.md
harness/PROMPT.es.md                  the same prompt in Spanish
docs/                                 conventions and roadmap
scripts/                              repository checks and helpers
tests/                                checks for the checks
```

Categories are created on first use and never reserved up front. The category is a navigation axis, not a routing rule: the artifact name in its frontmatter is what harnesses match.

## Contents

<!-- GENERATED:BEGIN -->
| Category | Agents | Skills |
|---|---|---|
| `coding` | 0 | 1 |
| `general` | 0 | 2 |
| `pi-tooling` | 0 | 1 |
| `research` | 1 | 0 |
<!-- GENERATED:END -->

## Portability rules

Three checks run in CI on every push:

- `scripts/check_portability.sh` fails on absolute paths, network addresses, hardware identifiers, email addresses, credentials and machine-specific provider or model ids. Test fixtures are excluded by design.
- `scripts/check_repo.py` fails on missing or inconsistent frontmatter, duplicate names, a category that disagrees with the directory, or an agent that requires a skill this repository does not publish.
- `scripts/gen_index.py --check` fails when the generated tables no longer match the files on disk.

Documentation, code comments and commit messages are in English.

## Contributing

`AGENTS.md` holds the rules an agent needs to work in this repository. Read `docs/conventions.md` before adding an artifact, and `docs/roadmap.md` before proposing one.

## License

MIT. See `LICENSE`.
