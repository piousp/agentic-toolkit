# Conventions

The rules every artifact in this repository follows. `AGENTS.md` at the root is the short version an agent reads; this file is the reasoning behind it.

## Naming

- Kebab-case, lowercase ASCII, no plurals rule: name the artifact for what it does.
- `name` in the frontmatter equals the directory name. Harnesses match on `name`.
- Names are unique per kind. A skill and an agent may share a name.
- The author prefix (`pablo-` in several skills) is kept for now: it marks authorship and avoids collisions when skills from different authors are installed side by side. It is a revisable decision, not a rule. If it is dropped, it is dropped for every artifact in one mechanical pass, because skills cite each other by name.

## Categories

One axis only: domain. Current vocabulary, extended on demand:

| Category | What it holds |
|---|---|
| `general` | Agents usable in any task: planning, execution, critique |
| `research` | Agents that look things up and report: local recon, web recon, analysis |
| `coding` | Skills and agents about writing and reviewing code |
| `writing` | Text production and revision |
| `academia` | Academic research and publication |
| `agent-authoring` | Writing skills and agents themselves |

A category is created with its first artifact, never before. It is a navigation axis: no harness routes on it, and moving an artifact between categories changes no reference to it.

## Frontmatter

Required everywhere: `name`, `description`. The description carries the routing decision: what the artifact does and when it applies. A description that only says "helps with X" gives the model nothing to route on.

Harness fields follow the reference harness and are documented in the artifact when their effect is not obvious. One rule is local to this repository: `model:` is not committed. A model id belongs to an account and a budget, not to an artifact.

## Dependencies

An agent may declare `skills:`, and only skills published here. `scripts/check_repo.py` fails otherwise.

Self-containment is the default, because a self-contained agent works in any harness while a dependent one works only when its skills are installed too. When a dependency is kept, it is a reviewed decision, stated in the agent's description. Each case is examined on its own: there is no blanket policy that a new agent must or must not depend on skills.

## Portability

Forbidden in every committed file:

| Kind | Example of what the check rejects |
|---|---|
| Absolute paths | a home directory path, a mount point, a Windows drive path |
| Network identity | IP addresses, subnets, MAC addresses, LAN hostnames |
| Personal identity | email addresses, phone numbers, account ids |
| Credentials | API keys, tokens, passwords, session ids |
| Account-bound values | provider ids, model ids, prices and quotas from one subscription |

The author's name and public GitHub handle are allowed: this is a public repository and authorship is not a secret.

The check is `scripts/check_portability.sh`. It scans every tracked file except the test fixtures, which contain synthetic violations on purpose.

### Material that stays out

These exist in the author's private setup and are excluded by the rules above, not by accident:

- Home network tooling: real addresses, device inventory and hardware identifiers.
- Lenses for a private project: they describe a private repository and its plan files.
- Academic pipeline tied to a thesis: the search, redaction and verification agents, and the thesis skill tree.
- Tooling for proprietary CLIs whose behavior cannot be verified by a reader.
- Skills and MCP servers maintained by someone else. This repository does not vendor or re-license third-party work; it links to the upstream.
- Provider-specific cost and latency skills, which encode one subscription's prices.

## Lenses

Several agents accept a lens: a Markdown file whose path arrives as ``Lens: <path>``. The lens replaces the agent's default report format, so a caller can demand a specific shape without writing a new agent. Agents that support it fail closed: a lens path that cannot be read produces `LENS_MISSING`, never a silent fallback to the default format.

There is no `lenses/` directory yet: no lens in the author's setup is publishable. When the first one is, the contract above is what it must satisfy. Locally, lenses live in the harness's own lens directory.

## Generated index

Tables between `<!-- GENERATED:BEGIN -->` and `<!-- GENERATED:END -->` come from `scripts/gen_index.py`, which reads each artifact's frontmatter. CI runs it with `--check` and fails on drift, so an index cannot describe a state of the tree that no longer exists.

## Discovery, by harness

| Artifact | Layout here | Discovered by the reference harness |
|---|---|---|
| Skill | `skills/<category>/<name>/SKILL.md` | Yes, `SKILL.md` directories are found recursively |
| Agent | `agents/<category>/<name>/AGENT.md` | No: agents are read one level deep, so they need a flattening step |

`scripts/link_agents.sh` performs that step as a development helper. The installer that replaces it is planned in `docs/roadmap.md`.

## Checks

| Check | Fails when |
|---|---|
| `scripts/check_portability.sh` | a forbidden value appears in a tracked file |
| `scripts/check_repo.py` | frontmatter is missing or inconsistent, names collide, a category disagrees with the directory, or a declared skill does not exist |
| `scripts/gen_index.py --check` | the generated tables disagree with the tree |
| `tests/run_tests.sh` | a check stops failing on the violation it is meant to catch |

## Decision log

| Decision | Choice |
|---|---|
| Repository scope | Skills, agents and MCP servers; no harness plugins, no npm packages |
| Relationship to the author's previous repository | New repository, curated copy; the old one is frozen |
| Content pass | Skeleton first; artifacts migrate one at a time, on request |
| Language | English, including documentation |
| Harness | Pi first, with Claude Code compatibility noted where it differs |
| License and visibility | MIT, public from the first commit |
| Third-party artifacts | Not included, not recommended |
| Deployment index | No `llms.txt`; `AGENTS.md` and `README.md` per directory, with generated tables |
| Agent categories | Same vocabulary as skills, one level above the agent directory |
| Skill categories | Created on first use, `README.md` per category, no lifecycle buckets |
