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

A skill that needs another one says so with `skill:<name>`, or with a relative link ending in `SKILL.md`. `scripts/check_repo.py` fails on the first form and `scripts/check_links.py` on the second when the target is missing. Prose mentions of agents inside skills are not checked yet: the agent name has to exist for the reference to work, but nothing enforces it.

Self-containment is the default. A skill that depends on another one is installable alone only if the dependency is installed too, and that is stated in its description.

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

## Harness wiring

`harness/` holds what installs into the harness agent directory rather than what a project consumes: the system instructions (`PROMPT.md` and its Spanish mirror `PROMPT.es.md`), and the settings and MCP placeholders. The agent directory is `~/.pi/agent` by default, moved by `PI_CODING_AGENT_DIR`.

Two rules follow from how a harness loads context files:

- One instructions file per directory. `AGENTS.override.md` replaces `AGENTS.md` in that directory instead of appending to it, so there is no additive overlay: private rules live in the same file, never in a second user-level one.
- The prompt is opinionated, not neutral. It demands confirmation before editing an existing file even when the request names the edit. That is the author's own behaviour, published as-is and labelled as such in `harness/README.md`.

The two prompt files are the one documented exception to the English-only rule: they are mirrors in two languages, section for section, and installing one excludes the other because they install to the same path.

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
| `scripts/check_repo.py` | frontmatter is missing or inconsistent, names collide, a category directory is not kebab-case, or a declared skill does not exist |
| `scripts/gen_index.py --check` | the generated tables disagree with the tree |
| `scripts/check_changelog.py` | a date block is missing, out of order or empty, a section is not one of the four, or an entry is split over two lines or does not start with its paths |
| `scripts/check_links.py` | a relative link or image in a Markdown file does not resolve |
| `scripts/check_mirror.py` | the two prompt files disagree on a section, a rule count or an `[ALWAYS]`/`[NEVER]` count |
| `tests/run_tests.sh` | a check stops failing on the violation it is meant to catch |
| `scripts/check_overlap.py` | the candidate covers the work of an artifact already published, of any kind |

The last check calls a model that belongs to an account: by hand it runs on the artifact being added, and `ci.yml` runs it as its own job, over the artifacts that change adds on a push or a pull request, or over the whole catalog on a manual dispatch (`--all`, one request per artifact). It reads the base URL, the model id and the key from `TOOLKIT_JUDGE_BASE_URL`, `TOOLKIT_JUDGE_MODEL` and `TOOLKIT_JUDGE_API_KEY`, and exits 2 when one is missing: a check that cannot run never reports success. The repository keeps the first two as variables and the key as a secret; while the key is empty the job reports that and judges nothing, and a pull request from a fork cannot run it because repository secrets are not delivered there. The catalog and the candidate travel together in the request state, and the candidate's declared `skills:` go with them so that a dependency is not read as an overlap. Each question names its own artifact and the state repeats that name, because a decision model may ignore the question id. The verdict is the most likely answer over the `none`, `partial` and `high` criteria; a tie counts as `high`. The log prints the three probabilities per artifact and the `usage`, `cost` and `energy` blocks the endpoint returns, whole. Saved responses in `tests/fixtures/overlap/` cover every branch without a network call.

`scripts/pre_push.sh` runs the six offline checks in one command for a local pre-push hook. It is convenience, not enforcement: the hook can be skipped with `--no-verify` and CI is what makes a rule hold.

## Decision log

| Decision | Choice |
|---|---|
| Repository scope | Skills, agents and MCP servers; no harness plugins, no npm packages |
| Relationship to the author's previous repository | New repository, curated copy; the old one is frozen |
| Content pass | Skeleton first; artifacts migrate one at a time, on request |
| Language | English, including documentation, with one exception: `harness/PROMPT` exists in English and Spanish as a mirror |
| Harness | Pi first, with Claude Code compatibility noted where it differs |
| License and visibility | MIT, public from the first commit |
| Third-party artifacts | Not included, not recommended |
| Deployment index | No `llms.txt`; `AGENTS.md` and `README.md` per directory, with generated tables |
| Agent categories | Same vocabulary as skills, one level above the agent directory, with a `README.md` per category as for skills |
| Skill categories | Created on first use, `README.md` per category, no lifecycle buckets |
| Instructions file | Installs as the agent directory's `AGENTS.md`; no layering, so private rules share the same file |
| Skill evaluation suites | Kept out of the skill they belong to: building and judging one is a separate job, and no artifact for it is published yet |
| Category of a skill about skills | `general`, not `agent-authoring`: it applies to any task that produces a skill, and a category is navigation, not a claim about the subject |
| Renaming during migration | `pablo-code-philosophy` becomes `pablo-coding-style`: skills cite each other by name, and the old name no longer describes the content (style plus the principles behind it), so the rename happens once, in the migration that publishes the artifact |
| Self-contained artifacts | An artifact published here names no other skill or agent in its description, body or references, not even one this repository publishes; a name the reader may not have installed routes to nothing, and the rule reads the same without it. A dependency that must exist is declared per the Dependencies section instead |
| Changelog rules as a check | The changelog rules were prose nobody enforced; `scripts/check_changelog.py` runs them, path-first entries included, so the seven entries that broke the shape were rewritten once rather than left as a rule with no control |
| Link checking scope | One repository-wide check replaces the artifact-scoped `SKILL.md` link rule: the question is whether a file exists, and it does not change with the kind of artifact that points at it |
| Overlap check | A decision model configured from the environment judges a candidate against the published catalog. The repository commits no provider or model id: the URL and the model live in repository variables and the key in a repository secret |
| Overlap check in CI | A job of its own in `ci.yml`: on a push or a pull request it judges the artifacts that change adds, and a manual dispatch audits the whole catalog with `--all`, one request per artifact. A pull request from a fork cannot be judged, because repository secrets are not delivered there, and an empty key makes the job say so instead of passing quietly |
| Pre-push hook | A committed `scripts/pre_push.sh` the user links into `.git/hooks`, not the `pre-commit` framework: no new dependency, and the same six offline checks in 0,2 s. It is convenience, not enforcement |
