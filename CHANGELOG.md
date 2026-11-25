# Changelog

Notable changes, newest first, one block per date. There are no releases: artifacts are consumed from a commit.

## 2026-11-25

### Added

- Repository scaffold: agent rules, README, MIT license.
- `docs/conventions.md`: naming, categories, frontmatter, portability.
- `docs/roadmap.md`: phases, installer, atelier workflow.
- `scripts/check_repo.py`, `scripts/check_portability.sh`, `scripts/gen_index.py`: the three checks.
- Reference checking in `check_repo.py`: a mention of a skill the repository does not publish fails the check.
- `.github/workflows/ci.yml`: the checks run on push and on pull request.
- `scripts/link_agents.sh`: links agents into a harness directory.
- `tests/`: fixtures and a runner proving each check can fail.
- `skills/pi-tooling/find-pi-session/`: finds the current pi session. Reads only, unless `--create` is passed.
- `skills/general/pablo-goal-discovery/`: turns a vague ask into a confirmed goal. Uses `find-pi-session`.
- `harness/PROMPT.md` and `harness/PROMPT.es.md`: the system prompt, English and Spanish.
- `harness/README.md`: install mapping, the no-layering rule, what the prompt assumes.
- `harness/settings.example.json` and `harness/mcp.example.json`: placeholders, no account values.
- `agents/research/scout/AGENT.md`: first agent.
- `skills/coding/pablo-coding-style/`: the coding style skill, migrated as a self-contained artifact that names no other skill.
- `skills/coding/README.md`: category readme for skills and agents about writing and reviewing code.

### Changed

- `docs/conventions.md`: decision-log entries for the rename during migration and for self-contained artifacts.
- Example configuration moved to `harness/`.
- The prompt rewritten in the agents' voice: labelled rules, `[ALWAYS]` and `[NEVER]` on the absolute ones.
- The toolkit now calls itself an opinionated collection, in `README.md`, `AGENTS.md` and the GitHub description.
- `AGENTS.md`: rules for the changelog.

### Fixed

- `skills/coding/pablo-coding-style/`: the link text of 28 references matches its relative target.
- `skills/coding/pablo-coding-style/SKILL.md`: the DRY pipeline step names the rule `DRY.md` defines.
- The linking helper and the install instructions use `PI_CODING_AGENT_DIR`, the variable the harness reads.
- The index generator no longer takes a prose mention of the markers for the generated region.
