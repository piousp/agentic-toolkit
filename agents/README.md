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
| [`scout`](./research/scout/AGENT.md) | `research` | Fast codebase recon: finds files, symbols, patterns, and references. No analysis, no evaluation, no implementation. Returns compressed findings (file paths,... |
<!-- GENERATED:END -->
