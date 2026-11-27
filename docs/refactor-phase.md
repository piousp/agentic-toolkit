# Refactor phase

A supervised procedure that carries one frozen scope to a closed refactor: eight
states in a fixed order, one JSON receipt as the evidence, and a gate that
decides between closing and a second round. It wires three published artifacts
and one server: the planner is
[`refactor-planner`](../agents/coding/refactor-planner/AGENT.md), the executor is
[`code-implementer`](../agents/coding/code-implementer/AGENT.md), detection,
thresholds, gate rows and priorities come from
[`refactor-identification`](../skills/coding/refactor-identification/SKILL.md),
and the measurement server is `mcps/refactor-report/`, described here by its
contract and not by its files.

## Who does what

| Party | Artifact | Does | Never does |
|---|---|---|---|
| Coordinator | the dispatch and the receipt | freezes and seals the scope, dispatches one step per run, runs the gate, writes the receipt | edit the target inside a step, replan a red step by hand |
| Detection | `refactor-identification` skill | produces `RF-n` rows with evidence, measure and priority inside the frozen scope | execute, or widen the scope |
| Planner | `refactor-planner` agent | one disposition per candidate, ordered steps with a test line and a `verify:` | derive or reseal the selector, measure, apply, persist the plan |
| Executor | `code-implementer` agent | one step per run, entry `mode: refactor` declared in the dispatch | measure, write the receipt, run the gate, open the next step |
| Measurement server | `mcps/refactor-report/` | measures a manifest, previews a change, reports the digests | write to the target repository |

The executor receives `mode: refactor` in the dispatch; a dispatch without a
declared mode is `STOP-1`, never a silent default. The planner is read-only and
takes the selector as delivered: it never derives one, never resolves a symbol
into a different scope, and a selector without its `sealed` value is `BLOCKED`.
The server measures and previews; it never writes.

## States

| State | What happens | Evidence it leaves | Who |
|---|---|---|---|
| `P0` freeze | the scope is fixed once and sealed: the diff text, or the sha256 manifest; `tree_clean` and `base_ref` are recorded here and never later | sealed selector, its digest, `tree_clean`, `base_ref` | coordinator |
| `P1` detection | the four categories and their thresholds run over the frozen scope only | `RF-n` rows: category, evidence, measure, gate note, priority | detection |
| `P2` selection | a person chooses which `RF-n` rows this run dispatches | `candidates:` for the dispatch | human |
| `P3` plan | one disposition per candidate, steps in dependency order, one test line and one `verify:` per step, seams proposed | PLAN / TECHNICAL | planner |
| `P4` approval | a person approves the plan; the approval counts as the confirmation of every seam and of every step carrying `approval: human` | approved plan, one dispatch per step | human |
| `P5` execution | one step per run with `mode: refactor`, evidence persisted; a step of judgment does not run before `P4` | changed files, the step's `verify:` result | executor |
| `P6` gate | the manifest is remeasured and compared with the frozen one; suite, `verify:`s and digests are read | green, or red attributed to the phase or to the environment | coordinator |
| `P7` closing | the receipt is written: the run closes, or round 2 opens | receipt with `verdict` and `round` | coordinator |

No run reaches `P5` with a seam that only the plan proposed. `P4` is where seams
stop being proposals, and it is a human decision, not a step.

## The anchor

- The anchor is the frozen scope plus a sha256 manifest, one line per file in
  scope, `<sha256>  <path>`, taken from the state read at freeze. Its digest is
  the identity of the run.
- `base_ref` is git metadata: optional, recorded only when `tree_clean` is true
  (an empty `git status --porcelain` at freeze). On a dirty tree it is `absent`,
  because the base would then be a claim and not a fact.
- Every value measured at freeze, occurrence counts included, goes into the
  receipt with the command that produced it. Nothing is persisted as a baseline
  and nothing is compared against a previous run.
- A file that changes after the freeze makes a different scope. The gate says so
  and never re-reads the file as though it were still the same run.

## The two modes

| Mode | Selector | Anchor | What closing adds |
|---|---|---|---|
| `diff` | the diff the caller hands over, or the branch's own diff, sealed by the sha256 of the diff text | the changed hunks | the change fits inside the frozen diff; `base_ref` only with `tree_clean` |
| `area` | one granularity, function, class, module or repository, with every symbol resolved to exactly one declaration | the sha256 manifest of every file under the selector | `followups[]` lists every candidate not dispatched as `P3` with its reason; closing with follow-ups is a valid close |

The modes are exclusive because a run has one anchor: a hunk and a declared area
cannot both be the place a finding lands. A dispatch carries exactly one branch,
and both branches in the same dispatch is the exclusion violated rather than a
preference to resolve, so the run is `BLOCKED`. The mode changes the anchor
(hunks against a manifest), the priority cascade (a branch-added root cause
against fix size inside the selector) and what closing requires (fitting the
diff against a complete follow-up list).

## The receipt

One JSON object per run, written in the session directory, `<session>.files/`,
and never in the target repository:

```json
{
  "phase": "<P0-P7>",
  "mode": "<diff|area>",
  "selector": "<the sealed selector, verbatim>",
  "round": "<1|2>",
  "frozen_manifest_digest": "<sha256 of the manifest at freeze>",
  "tree_clean": "<true|false>",
  "base_ref": "<ref|absent>",
  "measures": [{"path": "<path>", "sha256": "<digest>", "loc": "<n>", "command": "<verbatim>"}],
  "preview_digest": "<digest of the previewed change>",
  "applied_digest": "<digest of the applied change>",
  "identity": "<true|false>",
  "ruleset": "<file>#sha256:<12> of the transformation ruleset the preview used>",
  "steps": [{"n": "<step>", "verify": "<verbatim verify: text>", "command": "<verbatim>", "status": "<pass|fail|blocked>"}],
  "checks": "<suite result per touched file, and the pre-existing failures>",
  "tests_added": [{"path": "<path>", "kind": "<architecture|characterization>", "lifecycle": "<keep|retire|pending-decision>"}],
  "followups": [{"rf": "<RF-n>", "priority": "<P3>", "why": "<reason it was not dispatched>"}],
  "verdict": "<green|red-attributable|red-environmental>",
  "emitter": "<coordinator>",
  "emitted_at": "<ISO-8601 timestamp>"
}
```

`measures[]` holds the manifest as remeasured, each entry with the command that
produced it. `ruleset` names the transformation ruleset the preview read, by the
first twelve characters of its digest, so a run that changed the rules is a
different run. `steps[]` holds each step's `verify:` text
and the command that showed it, so the gate can be repeated from the receipt.

## The gate

| Applies | Condition of closing | Proved by |
|---|---|---|
| common | the remeasured manifest equals the frozen one, except for the paths declared in the `files` of the steps | `measures[]` against `frozen_manifest_digest` |
| common | `identity` is `true` | `preview_digest`, `applied_digest` |
| common | every `verify:` is present and green, with its command verbatim | `steps[]` |
| common | the full suite shows no regression per touched file and no new failure outside the pre-existing ones | `checks` |
| common | nothing changed outside the declared paths | the remeasured manifest and the run's diff |
| common | `tests_added[]` carries a `lifecycle` for every entry | `tests_added[]` |
| `diff` only | the change fits inside the frozen diff | the frozen diff against the applied change |
| `diff` only | `base_ref` is present only when `tree_clean` | `tree_clean`, `base_ref` |
| `area` only | `followups[]` enumerates every candidate not dispatched as `P3`, with its reason | `followups[]` |

How the gate is read:

- Remeasuring the manifest and getting the frozen digest back is the proof that
  the phase did not touch what it did not declare. A different digest in a path
  no step declared is red attributed to the phase, not to the environment.
- The digest of the previewed change and the digest of the applied change being
  identical is the proof that the executor applied the change that was previewed.
  Two different digests are red attributed to the phase as well: the run is never
  closed on a claim that the difference is cosmetic.
- Red attributed to the phase reopens the run as round 2.
- Red attributed to the environment (an install, the runner, the machine, a
  pre-existing failure count that moved) opens no round: the phase is blocked,
  and the reason is written in the receipt. `checks` carries it in words.

## Rounds

Two rounds at most per run. The second opens only with `verdict:
red-attributable` from the first, and it re-enters at `P3` with the steps that
came back red; `P0`, `P1` and `P2` do not repeat, because the anchor and the
candidate set do not change, and the receipt records `round: 2`. A
`red-environmental` verdict never opens a round: it blocks the phase with the
reason written.

## Tests the phase creates

Every test the phase creates appears in `tests_added[]` with its `path`, its
`kind` (`architecture` for an assertion written on the structure a step of shape
declares, `characterization` for the behavior a step of judgment must preserve
and pin as a regression) and its `lifecycle`. Retiring one requires a recorded
human decision, in the receipt or in the session's decision log; there is no
automatic step that removes a test the phase created, and `lifecycle` is read at
the gate, never inferred from what the suite happens to run.

## Declared limitations

- Measurement is produced by the measurement server or by the coordinator, never
  by the planner or the executor. Their bash whitelists are closed lists with no
  counting command and no line arithmetic, so a number either one reports is not
  a measure.
- The overlap check needs the decision model configured by environment
  variables, as [`conventions.md`](conventions.md) describes; the repository
  commits no provider or model id. Without those values the check judges nothing
  and exits 2, and a run that misses the verdict records the gap instead of
  reading it as a pass.
- The smoke over the target tree is not reproducible on another machine. It
  reads one working tree as it was at that moment; the receipt keeps what this
  machine observed, and a second operator repeats the gate from the manifest.

## Phase status

The phase is implemented on the `refactor-phase` branch. Its closing, `P0`
through `P7`, is exercised on a clean clone, because a green baseline can depend
on a dirty working tree: an uncommitted file changes the frozen manifest, and a
local change can hide a failure or invent one.
