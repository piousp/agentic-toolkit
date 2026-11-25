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
| `general` | 1 | 2 |
| `pi-tooling` | 0 | 1 |
| `research` | 2 | 0 |
<!-- GENERATED:END -->

## Portability rules

Six checks run in CI on every push:

- `scripts/check_portability.sh` fails on absolute paths, network addresses, hardware identifiers, email addresses, credentials and machine-specific provider or model ids. Test fixtures are excluded by design.
- `scripts/check_repo.py` fails on missing or inconsistent frontmatter, duplicate names, a category directory whose name is not kebab-case, or an agent that requires a skill this repository does not publish.
- `scripts/gen_index.py --check` fails when the generated tables no longer match the files on disk.
- `scripts/check_changelog.py` fails when `CHANGELOG.md` breaks a date block, the order of its sections, or the one-line, path-first shape of an entry.
- `scripts/check_links.py` fails when a relative link or image in a Markdown file points at nothing.
- `scripts/check_mirror.py` fails when the two prompt files stop matching section by section.

A seventh check needs a model that belongs to an account, so it takes its configuration from the environment and commits nothing account-bound: `TOOLKIT_JUDGE_BASE_URL`, `TOOLKIT_JUDGE_MODEL` and `TOOLKIT_JUDGE_API_KEY`. Run it on the artifact being added:

```sh
scripts/check_overlap.py skills/<category>/<name>/SKILL.md
```

It asks the configured decision model whether the candidate covers the work of an artifact already published, of any kind, and fails on a high overlap. `--all` audits the whole catalog, every artifact against every other one, one request per artifact; that is what a manual run of `ci.yml` does from the Actions tab. On a push or a pull request the same job judges only the artifacts that change adds. The repository stores the URL and the model as variables and the key as a secret. While the key is empty the job says so and judges nothing, and a pull request from a fork cannot run it at all, because repository secrets are not delivered there. Without the three values the check exits 2 instead of passing silently. The log carries the probabilities of every verdict and the usage, cost and energy blocks the endpoint returns.

### Pre-push hook

Running the six offline checks before a push is optional:

```sh
ln -s ../../scripts/pre_push.sh .git/hooks/pre-push
```

The hook leaves out the overlap check, which belongs to CI, and checks the tree as it is, not the index. CI is the authority: a hook can be skipped with `--no-verify` and does not exist for anyone who never installed it.

Documentation, code comments and commit messages are in English.

## Contributing

`AGENTS.md` holds the rules an agent needs to work in this repository. Read `docs/conventions.md` before adding an artifact, and `docs/roadmap.md` before proposing one.

## License

MIT. See `LICENSE`.
