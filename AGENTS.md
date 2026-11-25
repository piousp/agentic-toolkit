# Repository rules

Instructions for agents working in this repository. Human-facing documentation lives in `README.md`.

## What this repository is

A public, opinionated collection of skills, agents and MCP servers. Portability outranks convenience: an artifact that cannot be copied to another machine unchanged does not belong here.

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

`harness/PROMPT.md` and `harness/PROMPT.es.md` are mirrors: same sections, same rules, same order, one per language. A skill may ship the same pair for its own instructions: `SKILL.md` and `SKILL.es.md` at the skill root, matching section by section. Change a pair in the same edit. These two pairs are the only documented exception to English-only documentation.

## Changelog rules

`CHANGELOG.md` records what changed, not what was versioned. The repository publishes no releases, so there are no version headings and no `[Unreleased]` block.

- One block per date, headed `## YYYY-MM-DD`, newest first. A change joins that date's block; do not open an empty block.
- Allowed sections, in this order: `### Added`, `### Changed`, `### Fixed`, `### Removed`. Keep a section only when it has an entry.
- One line per change, path first: the paths in backticks, a colon, then the description. `scripts/check_changelog.py` enforces the shape; a second sentence means a second entry.
- The entry lands in the same commit as the change it describes.

## Portability rules

Forbidden in every committed file: absolute paths, IP addresses, subnets, MAC addresses, hostnames, email addresses, credentials, and provider- or model-specific ids tied to one account. Personal-context material (home network, private projects, academic work tied to a thesis pipeline) stays out of this repository entirely.

## Checks before finishing

```sh
python3 scripts/check_repo.py
scripts/check_portability.sh
python3 scripts/gen_index.py --check
python3 scripts/check_changelog.py
python3 scripts/check_links.py
python3 scripts/check_mirror.py
tests/run_tests.sh
```

`scripts/check_overlap.py` is not in that list because it needs a decision model that belongs to an account, configured with `TOOLKIT_JUDGE_BASE_URL`, `TOOLKIT_JUDGE_MODEL` and `TOOLKIT_JUDGE_API_KEY`. Run it on the artifact being added, before it joins the catalog; `--added-since REF` judges the artifacts a commit added, and `--all` audits the whole catalog, every artifact against every other one. CI runs the first form on a push or a pull request and the second on a manual dispatch. Without the three values it exits 2, never 0.

`scripts/pre_push.sh` runs the six offline checks above in one command and can be installed as the repository's pre-push hook; it leaves the overlap check out, and CI remains the authority.

## Index

<!-- GENERATED:BEGIN -->
- `agents/general/analyst/AGENT.md`
- `agents/research/scout/AGENT.md`
- `agents/research/web-scout/AGENT.md`
- `skills/coding/pablo-coding-style/SKILL.md`
- `skills/general/pablo-goal-discovery/SKILL.md`
- `skills/general/writing-agent-skills/SKILL.md`
- `skills/pi-tooling/find-pi-session/SKILL.md`
- `skills/writing/pablo-humanize-text/SKILL.md`
<!-- GENERATED:END -->
