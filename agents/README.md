# Agents

An agent is a directory with an `AGENT.md`: a prompt a harness runs as its own
worker, with tools, turn limits and a model. The category groups agents by
domain and never changes what one can do. The name in the frontmatter is what a
harness matches.

Each agent here states its contract: what it returns, what it must not touch,
where its evidence comes from. The planner stops at a plan, the implementer at
one step, the scout at findings. A reader can tell from the file what a run
will produce, before running it.

## How a plan reaches an implementer

```mermaid
flowchart TD
    A["Objective or ticket"] --> B["code-planner: read-only, never changes state"]
    B --> C["PLAN + TECHNICAL: steps, test plan, seams proposed"]
    C --> D{"Caller confirms the seams"}
    D -- "still proposed" --> C
    D -- "seam confirmed: seam" --> E["code-implementer: one step, S0-S7"]
    E --> F["Evidence: red, green, affected suite, verify + four-section report"]
    F --> G{"Steps left in the plan?"}
    G -- "yes, next step" --> E
    G -- "no" --> H["Commit, or the next objective"]
```

The planner never confirms its own seams and the implementer never reopens the
plan, so the caller makes the only decision in the loop: confirming the seams.

To install an agent into a harness, see [`../docs/installation.md`](../docs/installation.md).
The list below is generated from each `AGENT.md`; rules for adding one are in
[`../AGENTS.md`](../AGENTS.md).

<!-- GENERATED:BEGIN -->
| Agent | Category | What it does |
|---|---|---|
| [`code-implementer`](./coding/code-implementer/AGENT.md) | `coding` | Implements one planned step in a declared mode, with persisted evidence. |
| [`code-planner`](./coding/code-planner/AGENT.md) | `coding` | Plans a change to code: decisions, contracts, test seams, ordered steps. |
| [`refactor-planner`](./coding/refactor-planner/AGENT.md) | `coding` | Plans a refactor from frozen candidates: dispositions, steps, evidence. |
| [`analyst`](./general/analyst/AGENT.md) | `general` | Reviews an artifact against explicit criteria and labels every claim. |
| [`planner`](./general/planner/AGENT.md) | `general` | Plans non-code work: tasks, projects, research, documents, writing. |
| [`scout`](./research/scout/AGENT.md) | `research` | Finds files, symbols and references in a codebase, without analyzing them. |
| [`web-scout`](./research/web-scout/AGENT.md) | `research` | Searches the web and returns a URL and a quote for each claim. |
<!-- GENERATED:END -->
