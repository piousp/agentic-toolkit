# Changelog

Notable changes, newest first, one block per date. There are no releases: artifacts are consumed from a commit.

## 2026-11-27

### Added

- `docs/installation.md`: how to install skills and agents, with the pre-push hook and the overlap check.
- `tests/fixtures/summary-bad/`: fixture for the summary length check.
- `skills/*/*/SKILL.md`, `agents/*/*/AGENT.md`: a `summary:` line, the one a human reads in the index tables.
- `skills/coding/refactor-identification/SKILL.md`: the refactor lens, rewritten for this repository with two exclusive entry modes and TypeScript only.
- `agents/coding/refactor-planner/AGENT.md`: the refactor planner, a sibling of the code planner, which turns sealed candidates into a disposed plan with two classes of step.
- `docs/refactor-phase.md`: the refactor phase as a state machine, with its receipt and its closure conditions.

### Changed

- `README.md`: what the toolkit is and who it is for, without install commands or the check list.
- `agents/README.md`, `skills/README.md`, `mcps/README.md`, `harness/README.md`, `agents/*/README.md`, `skills/*/README.md`: written for a human reader, with the how-to details moved to `docs/installation.md`.
- `scripts/gen_index.py`: the index tables show each artifact's `summary:`, falling back to the first sentence of `description`.
- `scripts/check_repo.py`, `tests/run_tests.sh`: fail on a `summary` longer than an index row.
- `AGENTS.md`, `docs/conventions.md`: `summary` documented as the human-facing line beside the routing description.
- `skills/coding/refactor-identification/SKILL.md`, `skills/coding/refactor-identification/references/typescript.md`, `skills/coding/refactor-identification/references/examples.md`: cells neutral to the entry mode, a grouping imposed from outside excluded from the clump row, and an area-mode example.
- `agents/coding/code-implementer/AGENT.md`: a declared `mode` of `tdd` or `refactor`, with the refactor reading of S2, S3 and STOP-3.
- `agents/README.md`: the plan diagram shows the refactor lane, the two decisions of the caller and the phase gate.
- `skills/coding/refactor-identification/SKILL.md`, `agents/coding/refactor-planner/AGENT.md`: the function selector names a symbol, not a line range, matching what the measurement server can resolve.
- `docs/roadmap.md`: the refactor phase named as the first supervised procedure of phase 8.

### Fixed

- `skills/coding/pablo-coding-style/SKILL.md`: quote the summary so the YAML frontmatter parses.
- `agents/coding/code-planner/AGENT.md`, `agents/general/planner/AGENT.md`: quote the `summary:` value so the frontmatter parses without lenient recovery.

## 2026-11-26

### Added

- `agents/general/planner/AGENT.md`: the read-only general planner, with non-code lenses and explicit routing of code objectives.
- `agents/coding/code-planner/`: the code planner, its ingested planning method, design-signal reference and test-planning reference.
- `agents/coding/README.md`: the coding-agent category description.
- `agents/coding/code-implementer/`: the implementer of one planned step, with the seam contract, the S0-S7 TDD state machine and the test and mocking references absorbed from the retired test-first skill.

### Changed

- `docs/conventions.md`: self-containment applies to skills only, so an agent may name a skill it declares in `skills:`.
- `agents/general/analyst/AGENT.md`, `agents/general/planner/AGENT.md`, `agents/coding/code-planner/AGENT.md`: an unreadable or missing lens now reports the single line `LENS_MISSING`, the same line scout and web-scout already emit.
- `docs/roadmap.md`: planner leaves the migration candidate list.
- `agents/coding/code-planner/AGENT.md`: the test loop is bound to each step's `verify:` instead of reading red, green and the affected suite as separate steps.
- `agents/coding/code-planner/AGENT.md`, `agents/coding/code-implementer/AGENT.md`: the step format carries the test seam, which the planner emitted and its contract did not declare.
- `agents/coding/code-planner/`: renamed from `coding-planner`, so the name states what it plans.
- `agents/README.md`: a diagram of the planner-to-implementer handoff.
- `AGENTS.md`, `README.md`, `agents/README.md`: generated indexes include both planners and the code implementer.

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
