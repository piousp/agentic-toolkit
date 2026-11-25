# Repository rules

Instructions for agents working in this repository. Human-facing documentation lives in `README.md`.

## What this repository is

A public, portable collection of skills, agents and MCP servers. Portability outranks convenience: an artifact that cannot be copied to another machine unchanged does not belong here.

## Layout rules

- Skills: `skills/<category>/<name>/SKILL.md`. Supporting files (`scripts/`, `references/`, `assets/`) sit beside the `SKILL.md` and are referenced by relative path.
- Agents: `agents/<category>/<name>/AGENT.md`. Supporting files (`references/`, `scripts/`, `tests/`) sit beside the `AGENT.md` and travel with the agent.
- MCP servers: `mcps/<name>/` with its own `README.md`. Only servers authored in this repository; third-party servers are used directly from their upstream package.
- Harness wiring: `harness/` holds the system instructions and the example configuration. It is not an artifact: no frontmatter, no generated index, and no artifact name to match.
- Never create a category directory before its first artifact. No placeholder directories, no `.gitkeep`.

## Frontmatter rules

- `name` and `description` are required. `name` equals the directory name.
- Names are unique per kind (a skill and an agent may share a name).
- The category lives in the path, not in the frontmatter.
- An agent that declares `skills:` may only name skills this repository publishes. Each such dependency is a deliberate choice: prefer a self-contained agent, and when an agent must depend on a skill, make the dependency visible in its description.
- Harness-specific fields (`tools`, `model`, `timeoutMs`, `systemPromptMode`, `inheritProjectContext`, `inheritSkills`) are kept as the reference harness needs them, and documented in the artifact itself when their effect is not obvious.

## Generated content

The tables at the end of the index files are produced by `scripts/gen_index.py`. Do not edit them by hand; run the script.

## Bilingual files

`harness/PROMPT.md` and `harness/PROMPT.es.md` are mirrors: same sections, same rules, same order, one per language. Change both in the same edit. They are the only documented exception to English-only documentation.

## Portability rules

Forbidden in every committed file: absolute paths, IP addresses, subnets, MAC addresses, hostnames, email addresses, credentials, and provider- or model-specific ids tied to one account. Personal-context material (home network, private projects, academic work tied to a thesis pipeline) stays out of this repository entirely.

## Checks before finishing

```sh
python3 scripts/check_repo.py
scripts/check_portability.sh
python3 scripts/gen_index.py --check
tests/run_tests.sh
```

## Index

<!-- GENERATED:BEGIN -->
- `agents/research/scout/AGENT.md`
- `skills/general/pablo-goal-discovery/SKILL.md`
- `skills/pi-tooling/find-pi-session/SKILL.md`
<!-- GENERATED:END -->
