# Skills

A skill is a directory with a `SKILL.md`: instructions a harness advertises by
name and description, and loads only when the task calls for it. That delayed
load explains why a description here reads like a routing rule and not like a
title.

Skills in this repository come in two sizes. Some state the principles that
decide what an artifact should look like; others walk a procedure from the
first step to the last. Both are invoked the same way, by name.

To install one, see [`../docs/installation.md`](../docs/installation.md). The
list below is generated from each `SKILL.md`; rules for adding one are in
[`../AGENTS.md`](../AGENTS.md).

<!-- GENERATED:BEGIN -->
| Skill | Category | What it does |
|---|---|---|
| [`pablo-coding-style`](./coding/pablo-coding-style/SKILL.md) | `coding` | The rules behind the code: YAGNI, KISS, DRY, SOLID, and small surgical edits. |
| [`refactor-identification`](./coding/refactor-identification/SKILL.md) | `coding` | Quantifies structural refactor candidates in a diff or a declared code area. |
| [`pablo-goal-discovery`](./general/pablo-goal-discovery/SKILL.md) | `general` | Turns a vague ask into a confirmed goal through numbered decisions. |
| [`writing-agent-skills`](./general/writing-agent-skills/SKILL.md) | `general` | How to write, tighten and retire an agent skill, from frontmatter to tests. |
| [`find-pi-session`](./pi-tooling/find-pi-session/SKILL.md) | `pi-tooling` | Finds the current pi session directory so run artifacts land beside it. |
| [`pablo-humanize-text`](./writing/pablo-humanize-text/SKILL.md) | `writing` | Rewrites a text so it reads as written by a person, in any genre. |
<!-- GENERATED:END -->
