# Skills

Each skill is a directory with a `SKILL.md`: a set of instructions a harness advertises by name and description, and loads only when the task calls for it.

Link a category into a harness to install every skill it holds:

```sh
ln -s "$PWD/skills/<category>" "$HOME/.pi/agent/skills/<category>"
```

Rules for adding one are in `AGENTS.md`.

<!-- GENERATED:BEGIN -->
| Skill | Category | What it does |
|---|---|---|
| [`pablo-coding-style`](./coding/pablo-coding-style/SKILL.md) | `coding` | Pablo's coding style and the principles behind it: YAGNI, then KISS, then DRY, then SOLID, plus FP, GoF and small surgical changes. Use when writing, editing... |
| [`pablo-goal-discovery`](./general/pablo-goal-discovery/SKILL.md) | `general` | Use when a vague or under-specified ask must become a confirmed goal before work begins. Runs the mattpocock grilling interview: rounds of numbered decisions... |
| [`writing-agent-skills`](./general/writing-agent-skills/SKILL.md) | `general` | Use when authoring, reviewing or refurbishing an agent Skill: writing SKILL.md frontmatter and body, structuring the scripts/references/assets folders, tight... |
| [`find-pi-session`](./pi-tooling/find-pi-session/SKILL.md) | `pi-tooling` | Locate the current pi session and its artifact directory from the variables pi exports. Use when a skill must write run artifacts next to the session, or whe... |
<!-- GENERATED:END -->
