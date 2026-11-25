# Changelog

Notable changes, newest first, one block per date. There are no releases: artifacts are consumed from a commit.

## 2026-11-25

### Added

- `AGENTS.md`, `README.md`, `LICENSE`: repository scaffold.
- `docs/conventions.md`: naming, categories, frontmatter, portability.
- `docs/roadmap.md`: phases, installer, atelier workflow.
- `scripts/check_repo.py`, `scripts/check_portability.sh`, `scripts/gen_index.py`: the three checks.
- `scripts/check_repo.py`: reference checking, so a mention of a skill the repository does not publish fails the check.
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
- `scripts/check_changelog.py`: fails when `CHANGELOG.md` breaks a changelog rule.
- `scripts/check_links.py`: fails when a relative link or image in a Markdown file points at nothing.
- `scripts/check_mirror.py`: fails when the two prompts disagree section by section.
- `scripts/check_overlap.py`: judges a new artifact against the existing catalog with a decision model configured by environment variables.
- `tests/fixtures/changelog/`: fixtures that make the changelog check fail, one per rule.
- `tests/fixtures/links/`: fixtures with a resolvable and a dangling relative link.
- `tests/fixtures/mirror/`: a pair of prompts that mirror each other and a pair that does not.
- `tests/fixtures/overlap/`: saved judge responses covering each verdict and each error path.
- `.github/workflows/ci.yml`: the changelog, link and mirror checks run on every push.
- `.github/workflows/ci.yml`: the overlap check runs as its own job, over the artifacts a change adds.
- `tests/fixtures/overlap/added.json`: saved response for the artifact a commit adds.
- `tests/fixtures/overlap/with-cost.json`: saved response with the usage, cost and energy blocks.
- `scripts/pre_push.sh`: the six offline checks in one command, for a local pre-push hook.
- `agents/research/web-scout/AGENT.md`: the web recon agent, with its two-query budget, failure JSON and lens mode.
- `agents/general/analyst/AGENT.md`: the analysis agent, with its evidence labels, severity scale and lens mode.
- `agents/general/README.md`: category readme for agents usable in any task.
- `skills/writing/pablo-humanize-text/`: the humanize-text skill, migrated with its English and Spanish references.
- `skills/writing/README.md`: category readme for text production and revision.
- `docs/conventions.md`: decision-log entries for the second rename and for Spanish references read as functional content.

### Changed

- `docs/conventions.md`: decision-log entries for the rename during migration and for self-contained artifacts.
- `harness/`: example configuration moved there.
- `harness/PROMPT.md`, `harness/PROMPT.es.md`: rewritten in the agents' voice, with labelled rules and `[ALWAYS]`/`[NEVER]` on the absolute ones.
- `README.md`, `AGENTS.md`: the toolkit now calls itself an opinionated collection.
- `AGENTS.md`: rules for the changelog.
- `scripts/check_repo.py`: the `SKILL.md` link rule moves to `check_links.py`.
- `scripts/gen_index.py`: generates the index inside `mcps/README.md` and `mcps/AGENTS.md`.
- `tests/run_tests.sh`: cases for the four new checks, and no inline comparison of the two prompts.
- `AGENTS.md`: the checks list names the new checks and the overlap step.
- `README.md`: the checks list names the new checks.
- `docs/conventions.md`: the checks table names the new checks, and the decision log records the overlap check.
- `.github/workflows/ci.yml`: the overlap job can be dispatched by hand, and a manual run audits the whole catalog.
- `scripts/check_overlap.py`: prints the usage, cost and energy blocks the endpoint returns, whole.
- `scripts/check_overlap.py`: `--all` judges every artifact against every other one, the audit of the state as it is.
- `tests/fixtures/valid/agents/general/demo-agent/AGENT.md`: the description names the skill it declares.
- `CHANGELOG.md`: seven entries now start with their paths, as the rule asks.
- `scripts/check_overlap.py`: each question names the artifact it asks about, because a decision model may ignore the question id.
- `scripts/check_overlap.py`: `--added-since REF` judges the artifacts a commit added.
- `tests/run_tests.sh`: cases for the artifact selection, including a throwaway git tree.
- `README.md`, `AGENTS.md`, `docs/conventions.md`: the overlap check runs in CI, and the pre-push hook is documented.
- `skills/general/pablo-goal-discovery/SKILL.md`: hyphens used as a pause become colons, semicolons and parentheses, in the prose and in the two format templates.
- `agents/research/README.md`: analysis leaves the category description, since the agent that does it lives in `general`.
- `docs/conventions.md`: an agent may name another agent once, in parentheses, as a routing hint.
- `skills/writing/pablo-humanize-text/SKILL.md`, `skills/writing/pablo-humanize-text/references/es.md`: the em-dash ban rests on the author's voice, and sentence variation becomes a craft habit rather than a detector signal.
- `skills/writing/pablo-humanize-text/SKILL.md`, `skills/writing/pablo-humanize-text/references/es.md`: the rewrite fixes constructions before words, a sound draft may ship unchanged, and the self-check catches a flattened passage.
- `skills/writing/pablo-humanize-text/SKILL.md`, `skills/writing/pablo-humanize-text/references/es.md`: the title matches the artifact name.
- `skills/writing/pablo-humanize-text/references/banned-list-en.md`, `skills/writing/pablo-humanize-text/references/banned-list-es.md`: the header states the review date and drops the detector claim.
- `skills/writing/pablo-humanize-text/references/banned-list-en.md`: future-narrative closers and narrated candor join the closers table.
- `skills/writing/pablo-humanize-text/SKILL.md`, `skills/writing/pablo-humanize-text/SKILL.es.md`: the Spanish mirror moves beside the skill, and the working-language line points at it.
- `AGENTS.md`, `skills/AGENTS.md`, `docs/conventions.md`: a skill may ship a Spanish mirror, and the rules state that the pair changes in the same edit.
- `skills/writing/pablo-humanize-text/references/banned-list-en.md`: the function-word note keeps its warning and drops a pointer to an appendix no reader can open.

### Fixed

- `skills/coding/pablo-coding-style/`: the link text of 28 references matches its relative target.
- `skills/coding/pablo-coding-style/SKILL.md`: the DRY pipeline step names the rule `DRY.md` defines.
- `scripts/link_agents.sh`, `README.md`: the linking helper and the install instructions use `PI_CODING_AGENT_DIR`, the variable the harness reads.
- `scripts/gen_index.py`: the generator no longer takes a prose mention of the markers for the generated region.
- `README.md`, `docs/conventions.md`: the checks no longer describe a category rule that does not exist.
