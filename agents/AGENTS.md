# Agents

Layout rules for this directory.

## Structure

Every agent is a directory holding an `AGENT.md`, grouped by category:

```text
agents/<category>/<name>/
  AGENT.md
  references/     optional: material the agent reads
  scripts/        optional: commands the agent runs
  tests/          optional: fixtures proving the agent behaves
```

The `name` in the frontmatter equals the directory name. The category lives in the path only.

## Discovery asymmetry

Harnesses discover agents one level deep: `agents/<name>.md` or `agents/<name>/AGENT.md`. This repository nests them one level deeper, so an agent directory must be flattened before a harness sees it. `scripts/link_agents.sh` does that with symlinks and is a development helper; the real installer is on the roadmap. The category directory is never a discovery target.

Skills do not have this constraint: a `SKILL.md` is discovered recursively, so `skills/<category>/<name>/` works in place.

## Frontmatter

Required: `name`, `description`. The rest is harness-specific and follows the reference harness: `tools`, `disallowedTools`, `model`, `systemPromptMode`, `inheritProjectContext`, `inheritSkills`, `thinking`, `maxTurns`, `timeoutMs`, `skills`.

Do not commit `model:` values. A model id belongs to an account, not to an artifact: leave it to the harness settings, and document the reasoning level the agent expects in the body instead.

## Dependencies between agents and skills

An agent may declare `skills:`. The rule is that every declared skill must be published in this repository, and `scripts/check_repo.py` enforces it.

Self-containment is the default. An agent that carries its own rules in `AGENT.md` or `references/` works alone in any harness; an agent that depends on skills only works when they are installed too. When a dependency is unavoidable, state it in the agent's description so the caller knows what must be present.

## Writing rules

- The prompt addresses the agent in the second person, in the imperative.
- State what the agent must not do, not only what it does.
- Name the contract: what the agent returns, in which shape, and which statuses exist.
- No project-specific, employer-specific or machine-specific details.

## Index

<!-- GENERATED:BEGIN -->
<!-- GENERATED:END -->
