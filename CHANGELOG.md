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
- `.github/workflows/ci.yml`: runs every check on push and pull request.
- `settings.example.json` and `mcp.example.json`: placeholders with no account-specific values.
- First agent migrated: `agents/research/scout/AGENT.md`.
