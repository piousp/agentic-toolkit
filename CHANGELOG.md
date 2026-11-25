# Changelog

All notable changes to this repository are recorded here. The format follows Keep a Changelog, and the project uses semantic versioning once artifacts start being consumed by name.

## [Unreleased]

### Added

- Repository scaffold: rules in `AGENTS.md`, human documentation in `README.md`, MIT license.
- `docs/conventions.md`: naming, categories, frontmatter, dependency and portability rules.
- `docs/roadmap.md`: planned phases, including the installer and the atelier workflow.
- `scripts/check_portability.sh`, `scripts/check_repo.py`, `scripts/gen_index.py`: the three checks that run in CI.
- `scripts/link_agents.sh`: development helper that flattens the category layout into a harness directory.
- `tests/`: fixtures and a runner proving that each check fails when it should.
- `skills/pi-tooling/find-pi-session/`: resolves the current pi session and its artifact directory, read-only unless `--create` is passed.
- `skills/general/pablo-goal-discovery/`: the grilling interview that turns a vague ask into a confirmed goal; depends on `find-pi-session` for the artifact path.
- Reference checking in `scripts/check_repo.py`: a `skill:<name>` mention or a link to a `SKILL.md` must resolve, or the check fails.
- `.github/workflows/ci.yml`: runs every check on push and pull request.
- `settings.example.json` and `mcp.example.json`: placeholders with no account-specific values.
- First agent migrated: `agents/research/scout/AGENT.md`.

### Changed

- Example configuration moved to `harness/`, together with the system instructions.

### Added in `harness/`

- `PROMPT.md`: the author's working prompt, distilled for publication, English.
- `PROMPT.es.md`: the same prompt in Spanish, section for section.
- `README.md`: install mapping, the no-layering constraint, and what the prompt assumes.

### Fixed

- The agent linking helper and the install instructions now use `PI_CODING_AGENT_DIR`, the variable the harness actually reads.
- The index generator no longer mistakes a prose mention of the generated markers for the generated region.
