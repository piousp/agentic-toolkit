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
| Coordinator | the dispatch and the receipt | freezes and seals the scope, produces `conventions` at `P0`, dispatches one step per run, runs the gate, writes the receipt | edit the target inside a step, replan a red step by hand |
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
| `P0` freeze | the scope is fixed once and sealed: the diff text, or the sha256 manifest; `tree_clean` and `base_ref` are recorded here and never later; `conventions` is produced here too, its four facts each with evidence, from the reading this state authorizes | sealed selector, its digest, `tree_clean`, `base_ref`, `conventions` | coordinator |
| `P1` detection | the four categories and their thresholds run over the frozen scope only | `RF-n` rows: category, evidence, measure, gate note, priority | detection |
| `P2` selection | a person chooses which `RF-n` rows this run dispatches, and the choice is recorded as the complete partition of the detected set: every `RF-n` is either a selected candidate or a not-selected one, and not selecting never equals discarding it nor lowering its priority | `candidates:` for the dispatch, the not-selected rows with the priority detection gave them | human |
| `P3` plan | one disposition per candidate, steps in dependency order, one test line and one `verify:` per step, seams proposed; `conventions` arrives already produced and sealed, and is consumed as given, never inferred and never completed | PLAN / TECHNICAL | planner |
| `P4` approval | a person approves the plan; the approval counts as the confirmation of every seam and of every step carrying `approval: human` | approved plan, one dispatch per step | human |
| `P5` execution | one step per run with `mode: refactor`, evidence persisted; a step of judgment does not run before `P4` | changed files, the step's `verify:` result, and in `mode: refactor` the structural observable the step recorded: `structure_check` and `null_refactor` | executor |
| `P6` gate | the manifest is remeasured and compared with the frozen one; the full suite is the command `conventions.full_suite_command` names, and the `verify:`s and the optional preview evidence are read | green, or red attributed to the phase or to the environment | coordinator |
| `P7` closing | the receipt is written: the run closes, or round 2 opens | receipt with `verdict` and `round` | coordinator |

No run reaches `P5` with a seam that only the plan proposed. `P4` is where seams
stop being proposals, and it is a human decision, not a step.

The approval of `P4` reaches the executor in the form the executor reads: the
dispatch of each step carries one literal line `seam confirmed: <seam>` per seam,
next to its `mode: refactor`. The approved plan already confirms those seams, but
the dispatch still has to say so with that line; a dispatch without it returns
`STOP-1`, and that stop is the executor working as it should, not a defect.

## The selection

`P2` is human and its output is a partition, not a filter: every `RF-n` detection
produced is either a candidate for this run or a not-selected one, and both
halves are recorded. Not selecting a candidate is neither a discard nor a
demotion: the row keeps the priority detection assigned it, and the reason
written for it is `human-selection`. Discarding belongs to detection alone, so a
candidate the detection gate already filtered out, `Filtered out (N<k>)`, stays
there and is never re-adjudicated in this phase; keeping a candidate out by a
gate reason this phase does not have requires another detection run, never a new
row written here.

## The anchor, the radius and the writing set

Three sets, named separately and never merged:

- **Anchor**: the frozen scope, a hunk of the sealed diff or the selector with
  its sha256 manifest, one line per file in scope, `<sha256>  <path>`, taken
  from the state read at freeze. It originates the candidates and it is never
  widened: no read and no step adds a path to it. Its digest is what names the
  run.
- **Radius**: the reading one hop away from the anchor, the direct callers and
  callees, the tests that exercise the place, and whatever else a step needs a
  cited fact from. The radius originates no `RF-n` and, on its own, never
  authorizes a write.
- **Writing set**: the union of the paths of the `where:` of the steps the plan
  approved at `P4`, production and test alike. It is computed at `P4`, and it is
  the only set a write lands in.

How the three read in practice:

- No hunk, no selector and no radius authorizes a write that no approved
  `where:` declares. A step that writes a path its `where:` does not hold is a
  change outside the set, and the gate reads it as one.
- In `area` mode the production the writing set holds stays inside the selector:
  production outside it is not dispatched. The declared test files of a step may
  sit outside the selector, because the test that observes a frozen area often
  lives elsewhere.
- In `diff` mode the writing set may hold new files, production or test, and each
  of them needs the human approval of `P4` like any other declared path.

What the anchor records, and what it refuses:

- `base_ref` is git metadata: optional, recorded only when `tree_clean` is true
  (an empty `git status --porcelain` at freeze). On a dirty tree it is `absent`,
  because the base would then be a claim and not a fact.
- Every value measured at freeze, occurrence counts included, goes into the
  receipt with the command that produced it. Nothing is persisted as a baseline
  and nothing is compared against a previous run.
- A file that changes after the freeze makes a different scope. The gate says so
  and never re-reads the file as though it were still the same run.
- The conditions of closing compare against the writing set, never against the
  anchor alone: the remeasured manifest, the declared paths and the diff of the
  run are read together.

## The conventions object

`conventions` is produced at `P0`, sealed with the freeze, and consumed at `P3`.
It is not remembered by the coordinator nor derived by the planner. It carries
four facts, and no value travels without its evidence:

| Field | Content | Evidence |
|---|---|---|
| `test_framework` | the test framework and the reusable test class a step extends | `path:line` |
| `test_layout_naming` | where tests live and how they are named | `path:line` |
| `source_layout_naming` | where production modules live and how they are named | `path:line` |
| `full_suite_command` | a reproducible command that runs the whole suite, or `none` | `path:line` |

- A fact the repository does not have is declared `none` with the evidence that
  shows it is absent. No value is invented to fill a row.
- `full_suite_command: none` carries its justification in the same field, so the
  gate reads a declaration instead of a run that never happened.
- Reading authorized for this purpose and for nothing else: to assemble
  `conventions`, `P0` may read the manifests and the tests outside the anchor.
  Those reads originate no `RF-n` and do not widen the radius; the
  frozen scope still decides where a finding lands, and no other read is excused
  from it.
- A missing field, or a missing one of the four facts, is `BLOCKED` naming that
  fact. Sources present but incompatible with each other, two equally valid test
  conventions for instance, are one `Q<n>` with the conservative recommendation
  marked `[ASSUMED]`. These are the only two outcomes of an incomplete or a
  contradictory `conventions`.

## The two modes

| Mode | Selector | Anchor | What closing adds |
|---|---|---|---|
| `diff` | the diff the caller hands over, or the branch's own diff, sealed by the sha256 of the diff text | the changed hunks | the change fits inside the writing set, which may add new files, production or test, each approved at `P4`; `base_ref` only with `tree_clean` |
| `area` | one granularity, function, class, module or repository, with every symbol resolved to exactly one declaration | the sha256 manifest of every file under the selector | `followups[]` lists every candidate not dispatched, with the priority detection gave it and its reason, `human-selection` or `detected-P3`; closing with follow-ups is a valid close |

The modes are exclusive because a run has one anchor: a hunk and a declared area
cannot both be the place a finding lands. A dispatch carries exactly one branch,
and both branches in the same dispatch is the exclusion violated rather than a
preference to resolve, so the run is `BLOCKED`. The mode changes the anchor
(hunks against a manifest), the priority cascade (a branch-added root cause
against where the fix is produced inside the selector: the root cause's own
file, another file of the selector, or a fix that crosses it) and what closing
requires (fitting the diff against the writing set and, in `area`, against a
complete follow-up list).

## The receipt

One JSON object per run, written in the session directory, `<session>.files/`,
and never in the target repository:

```json
{
  "phase": "<P0-P7>",
  "mode": "<diff|area>",
  "selector": "<the sealed selector, verbatim>",
  "round": "<1|2>",
  "frozen_digest": "<area: sha256 of the manifest at freeze; diff: sha256 of the sealed diff text>",
  "tree_clean": "<true|false>",
  "base_ref": "<ref|absent>",
  "conventions": {"test_framework": "<value> at <path:line>", "test_layout_naming": "<value> at <path:line>", "source_layout_naming": "<value> at <path:line>", "full_suite_command": "<command> at <path:line>|none, justification"},
  "measures": [{"path": "<path>", "sha256": "<digest>", "measure": "<loc|occurrences|activity|the name detection uses>", "value": "<n>", "command": "<verbatim>"}],
  "preview_match": "<true|false|null>",
  "preview_digest": "<digest of the previewed change, or null when nothing was previewed>",
  "applied_digest": "<digest of the applied change, or null when nothing was applied>",
  "ruleset": "<file>#sha256:<12> of the transformation ruleset the preview used|none, when no preview ran>",
  "steps": [{"n": "<step>", "verify": "<verbatim verify: text>", "command": "<verbatim>", "status": "<pass|fail|blocked>", "structure_check": "<the deterministic command or read, and the fact it reads>|none", "null_refactor": "<true|false|null>|none"}],
  "checks": {"steps": [{"n": "<step>", "affected_suite": "<command and result per touched file>", "preexisting_failures": "<names and counts>"}], "full_suite": {"command": "<conventions.full_suite_command>", "status": "<pass|fail|not_applicable|environmental>", "result": "<counts and failing tests>", "justification": "<why it did not run, when it did not>"}},
  "tests_added": [{"path": "<path>", "kind": "<architecture|characterization>", "lifecycle": "<keep|retire|pending-decision>"}],
  "followups": [{"rf": "<RF-n>", "priority": "<as detected: P1|P2|P3>", "reason": "<human-selection|detected-P3>", "why": "<reason it was not dispatched>"}],
  "unresolved": [{"rf": "<RF-U<n>>", "where": "<path:line>", "missing": "<the one fact that is missing>"}],
  "verdict": "<green|red-attributable|red-environmental>",
  "emitter": "<coordinator>",
  "emitted_at": "<ISO-8601 timestamp>"
}
```

`frozen_digest` carries one value under two readings and never both at once: in
`area` mode it is the sha256 of the manifest of the selector, and in `diff` mode
it is the sha256 of the sealed diff text.

`measures[]` is the measurement receipt, the block every number the plan cites
comes from. Its entries are produced at `P1`, as detection measures the frozen
scope, and each holds what was measured in `measure`, the number in `value`, the
path it belongs to and the exact command that reproduces it; the block is not
remade in a later state, and the manifest the gate remeasures at `P6` is
appended to it instead of written over the entries `P1` recorded. A number the
plan cites and that no entry of this block holds is marked `[UNVERIFIED]`, never
recomputed. `conventions` is the object `P0` produced, recorded whole with the
four facts, the value of each and its evidence, so the gate can name the full
suite it ran and an audit can read the plan against the facts it consumed.
`ruleset` names the transformation ruleset the preview read, by the
first twelve characters of its digest, so a run that changed the rules is a
different run; a run that previewed nothing writes `none`, and a missing preview
invalidates no condition of closing. `steps[]` holds each step's `verify:` text
and the command that showed it, so the gate can be repeated from the receipt. In
`mode: refactor` each entry also carries the two fields of the structural
observable the executor produced: `structure_check`, the deterministic command
or read and the fact it reads, and `null_refactor`, `true` when the structure
after the change equals the one before, `false` when the two differ, `null` when
there was no `structure_check` to compare. In `mode: tdd` both are registered
`none`.

`preview_match` carries the relation between the two digests and nothing else:
`null` when one or both are missing, `true` when both exist and agree, `false`
when both exist and differ. `preview_digest` and `applied_digest` are optional
evidence, recorded only when the run previewed a change through the server and
applied it; their absence is a missing witness, not a failed run. The
`preview_digest` of the receipt is the `change_digest` the server returns for the
projected change, and `applied_digest` is that same digest computed over the
applied change; the receipt keeps its two names and never restates the server's
field.

`checks` keeps two kinds of evidence apart. `checks.steps[]` holds each step's
affected suite with the pre-existing failures it inherited, because that suite
proves the step and never the run. `checks.full_suite` holds the single run of
`conventions.full_suite_command` that the gate performs, with its counts and
the failures it found. A full suite that could not run is a status with its
justification, never a green written in place of a run.

`followups[]` holds every candidate the run did not dispatch, with the priority
detection assigned it and the reason it did not travel: `human-selection` when a
person left it out at `P2`, `detected-P3` when detection itself put it there.
The coordinator composes it from two sources it alone holds: the not-selected
half of the `P2` partition, which never reaches the plan, and the rows the plan
declared deferred. The plan writes dispositions for the candidates it received,
so a reason about a candidate it never saw is not one it can write.

`unresolved[]` holds every finding detection could not resolve, `RF-U<n>`, with
its location and the one fact that is missing. Such a finding is not a
candidate: it never receives a disposition, and no step of `steps[]` names one.

## The gate

| Applies | Condition of closing | Proved by |
|---|---|---|
| common | the remeasured manifest equals the frozen one, except for the paths of the writing set | `measures[]` (`path`, `sha256`) against `frozen_digest`: the sha256 of the manifest at freeze in `area` mode, the sha256 of the sealed diff text in `diff` mode |
| common | every `verify:` is present and green, with its command verbatim | `steps[]` |
| common | the full suite shows no new failure outside the pre-existing ones, and every step's affected suite is green with those same pre-existing failures named; that full suite is `conventions.full_suite_command`, run once at the gate | `checks.full_suite`, `checks.steps[]`, `conventions.full_suite_command` |
| common | nothing changed outside the writing set | the remeasured manifest and the run's diff |
| common | `tests_added[]` carries a `lifecycle` for every entry | `tests_added[]` |
| `diff` only | the change fits inside the writing set | the writing set against the applied change |
| `diff` only | `base_ref` is present only when `tree_clean` | `tree_clean`, `base_ref` |
| `area` only | `followups[]` enumerates every candidate not dispatched, with the priority detection assigned it and its reason, and every priority there equals the one detection produced | `followups[].priority`, `followups[].reason` |
| `area` only | `unresolved[]` enumerates every `RF-U<n>` detection reported, with its location and the fact that is missing, and no step of `steps[]` names one | `unresolved[]`, `steps[]` |

How the gate is read:

- Remeasuring the manifest and getting the frozen digest back is the proof that
  the phase did not touch what it did not declare. A different digest in a path
  outside the writing set is red attributed to the phase, not to the environment.
- A path a step declared that is not tracked yet, a new test file for instance, is
  read from `git status --porcelain` and compared against the writing set like
  every other path.
- `preview_match` is read in three ways. `null` means one or both digests are
  missing: it is neutral for closing, and it authorizes no claim about the
  identity of any two byte sequences. `true` means both digests exist, each with
  the reproducible command that produced it, and they agree: evidence that the
  change previewed is the change applied, never proof that the two are identical
  byte for byte. `false` means both exist and differ: red attributed to the
  phase, like any other difference no step declared.
- Red attributed to the phase reopens the run as round 2.
- Red attributed to the environment (an install, the runner, the machine, a
  pre-existing failure count that moved) opens no round: the phase is blocked,
  and the reason is written in the receipt. `checks` carries it in words.
- The full suite is the one `conventions.full_suite_command` names, run once at
  the gate, and the affected suite of a single step is not it: green over a
  step's suite proves the step, never the run. When the field is `none` with its
  justification, the receipt carries the declaration, and the gate claims no
  green for a suite nobody ran. A full suite that cannot be run is classified in
  `checks.full_suite` as `environmental` or as `not_applicable` with its
  justification; it is never recorded as an asserted green.

An ordinary close proves no equivalence with a preview, and this document does
not claim one. What sustains the close is the approval of `P4`, the paths the
steps declared and the `verify:`s; `preview_match` is read as evidence when it
exists and as `null` when it does not, and a run that touched none of it still
closes on the other conditions.

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
  by the planner or the executor. The planner's bash whitelist is a closed list
  and no form on it counts for the receipt; the executor's bash purposes are a
  closed list too and none of them authorizes measuring for the receipt. Neither
  list is widened here, so a number either one reports is not a measure.
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
