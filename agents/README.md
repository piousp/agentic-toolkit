# Agents

Each agent is a directory with an `AGENT.md`: a subagent a harness runs with its own prompt, tools and turn limits. Categories group agents by domain; the category is navigation, the name is identity.

Because harnesses read agents one directory level deep, a category layout needs one flattening step. `scripts/link_agents.sh` links every agent into the harness directory and never deletes anything:

```sh
scripts/link_agents.sh --dry-run
scripts/link_agents.sh
```

Rules for adding one are in `AGENTS.md`.

<!-- GENERATED:BEGIN -->
| Agent | Category | What it does |
|---|---|---|
| [`analyst`](./general/analyst/AGENT.md) | `general` | General-purpose analyst for code reviews, document audits, research and any investigation. Measures artifacts against explicit criteria with labeled evidence... |
| [`scout`](./research/scout/AGENT.md) | `research` | Fast codebase recon: finds files, symbols, patterns, and references. No analysis, no evaluation, no implementation. Returns compressed findings (file paths,... |
| [`web-scout`](./research/web-scout/AGENT.md) | `research` | Fast web searcher: runs 2 queries, reads 1 source, returns URL + quote; accepts an optional lens file for structured multi-source output |
<!-- GENERATED:END -->
