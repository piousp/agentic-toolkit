# Roadmap

Planned work, in order. Each phase names its exit criterion; nothing starts before the previous phase produces something usable.

## Phase 1 - Skeleton (done)

Repository structure, conventions, three checks and their tests, CI, first agent migrated.

Exit criterion: a clone passes every check and one agent can be linked into a harness.

## Phase 2 - Artifact migration, one at a time

Each artifact is reviewed on its own: portability, frontmatter, and whether it still earns its place. Candidates from the previous repository:

- Skills about writing and reviewing code: the philosophy, planning, test-first, simplification, refactor, review lenses.
- Skills about authoring skills.
- Agents: analyst, planner, worker, scout, web scout, critical thinker.

Exit criterion: the migrated set covers a full review-and-plan workflow with no personal detail.

## Phase 3 - Agent reformulation and auditability

Rewrite the agents so that each one states its contract: what it returns, which statuses exist, what it must not do, where its evidence comes from. The first two are already drafted in the previous repository.

Auditability checks worth building:

- A per-agent trace: inputs accepted, files read, decisions taken, output shape.
- A consistency check between an agent's declared tools and the tools its prompt asks for.
- Reference checking for agent names in prose (`agent:<name>`), the counterpart of the skill reference check that already runs.
- A report of which agents still depend on skills, and why.

Exit criterion: an agent's behavior can be reviewed from its artifacts alone, without running it.

## Phase 4 - Specialized agents

Split the general agents where specialization pays: planning, test design, audit, implementation, review. Each new agent must justify itself against the general one it replaces for that task.

Exit criterion: the specialized set is smaller than the sum of prompts it replaces, and no two agents overlap in scope.

## Phase 5 - Skill cleanup

Audit every skill: remove the ones a specialized agent absorbed, cut duplicated rules, tighten trigger descriptions. A skill that a reader cannot follow without the author present is a bug.

Exit criterion: no skill duplicates a rule that lives in an agent, and every description routes correctly in a blind test.

## Phase 6 - MCP servers

Publish the servers authored here, one directory each, with the README a reader needs to run it.

Exit criterion: a fresh clone runs each server from the documented command.

## Phase 7 - Installer

Replace `scripts/link_agents.sh` with a real installer:

- One POSIX entry point, `--dry-run` and `--copy` modes.
- Target directory from an environment variable, defaulting to the reference harness location.
- Flattening of the agent category layout, preserving each agent's supporting directories.
- Idempotent, never destructive, and it reports what it did.
- Handles the difference between harnesses that read nested skills and harnesses that do not.

Exit criterion: install and uninstall on a clean machine, twice, with the same result.

## Phase 8 - Atelier

A supervised software workflow: a deterministic state machine over the artifacts above, with explicit inputs and decision points, rather than an unsupervised loop.

Open questions to settle before designing it:

- Which states exist, and which one can be re-entered.
- What each state produces, and what makes a state's output invalid.
- Where a human decision is mandatory, and where the machine may proceed.
- How a run is audited after the fact: which evidence is kept, and for how long.

Nothing is designed yet. It depends on phases 3 to 5 producing agents with stable contracts.

## Out of scope

- Harness plugins, extensions and themes.
- Third-party skills and MCP servers.
- Material tied to a private project, a home network or a thesis pipeline.
- Account-specific model choices, prices and quotas.
