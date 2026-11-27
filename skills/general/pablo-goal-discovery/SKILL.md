---
name: pablo-goal-discovery
description: >
  Use when a vague or under-specified ask must become a confirmed goal before
  work begins. Runs the mattpocock grilling interview: rounds of numbered
  decisions with recommendations and scout fact lookups. After an empty
  frontier and explicit user confirmation, writes goal.md and the first
  decisions.md entry. Invocable as `/skill:pablo-goal-discovery`. Needs
  `skill:find-pi-session` to resolve where those files go, so install both.
  [DO NOT] trigger when a confirmed goal.md already exists for this work, or
  when the task does not need goal discovery (the ask is already clear and
  scoped, or is pure implementation/planning work).
summary: Turns a vague ask into a confirmed goal through numbered decisions.
---

# pablo-goal-discovery

Turn a vague or under-specified ask into a confirmed goal: the original
prompt, discovery decisions, constraints, and success criteria, written to
`goal.md` with the first `decisions.md` entry. Uses the mattpocock grilling
method. Coordinator-only: no subagent cast beyond fact-lookup scouts.

Grilling method sourced from mattpocock/skills; adapted (recommendation-first,
emoji markers, confirmation before writes, no auto-advance).

## Session working directory

This skill writes session-scoped artifacts (`goal.md`, `decisions.md`) to the
current pi session's artifact directory. Resolve it once at the start of the
pass, with the script that `skill:find-pi-session` owns:

```bash
python3 <find-pi-session-dir>/scripts/find_pi_session.py --create
```

Use the printed path literally wherever `<session-dir>` appears below; shell
variables do not survive across tool calls. The dependency is deliberate and
checked by the repository: without `skill:find-pi-session`, this skill cannot
write its artifacts.

## Entry conditions

- Check `<session-dir>/goal.md` before Step 0. A confirmed goal takes
  precedence over explicit invocation: [DO NOT] grill again; report its path
  and stop. New artifacts carry `Status: confirmed`.
- Otherwise, the user named `pablo-goal-discovery` in their message, or the
  task matches this description. That message is the entry confirmation:
  the first grilling round launches after Step 0 with no extra confirmation.
- The coordinator states in the same turn what the goal-discovery pass will
  do and which artifacts it will write after confirmation (`goal.md` + the
  first `decisions.md` entry).

## Step 0: quick scan (pre-round)

Before the first round, a fast context scan only; no spec or full
investigation. Read any project-level index and open the obvious files the
ask names, including code files. Identify what makes the ask weak:

- Ambiguous terms (names, paths, scopes that could mean two things).
- Missing context (constraints, boundaries, consumers).
- Unverified assumptions baked into the wording.

The scan feeds the first round's frontier; it does not answer anything.

## The grilling loop

The coordinator maintains a working **design tree** in scratch context: every
decision branches into the decisions that hang off it. [NEVER] persist the
tree itself; only the confirmed artifacts are written.

**Rounds.** The **frontier** is every decision whose prerequisites are
already settled. [ALWAYS] ask the whole frontier in one round: numbered
questions, a recommended answer for each, then wait. [NEVER] ask one question
at a time, [NEVER] ask a question whose prerequisite is unsettled.

**Frontier filtering (ask vs. assume).** Only decisions that change scope
(what gets built, which system/files are touched, what success means) enter
the round. If the ask does not define success, [ALWAYS] ask what success
means in the first round. Low-impact decisions (naming, format, defaults,
ordering) are assumed and flagged as explicit assumptions in `goal.md`.

**No progress.** If the frontier did not shrink, state that in the next header
and propose closing the remainder with recommendations flagged as assumptions.

**Recommended answers.** [ALWAYS] give a recommendation for every question -
the user should be able to answer "recommended" for the whole round. [NEVER]
ask open-ended questions without one.

## Round format

Ask the whole frontier in one round, as Markdown headings:

```markdown
### 🧭 Round 1: frontier

#### ❓ Q1: Content scope

- 🔹 **Option A:** harness artifacts only.
- 🔹 **Option B:** A plus extensions and themes.
- ✅ **Recommendation:** A, because the npm packages have their own cycle.
- 💡 **Fact:** agent discovery reads one directory level only.

#### ❓ Q2: Relation to the previous repository

- 🔹 **Option A:** new repository built from a curated copy.
- ✅ **Recommendation:** A, conditional on a history audit.
```

- [ALWAYS] one `####` heading per question, numbered `Q<N>` continuously
  across rounds.
- [ALWAYS] keep options, recommendation and facts inside the question they
  belong to. A fact that answers a file or environment question goes there,
  marked 💡, with its source.
- [ALWAYS] write the recommendation in bold, on its own line; [NEVER] bury it
  at the end of an option.
- [NEVER] use a heading level deeper than `####`: it stops reading as a
  heading in the terminal.
- [ALWAYS] write rounds in the language the user writes in; the example above
  shows structure, not language.
- Close the last round with the line `🧭 Frontier: empty`.

## Fact lookups via subagent

After Step 0, a frontier question that needs an environment fact (filesystem,
tools, docs, web) is [NEVER] asked of the user, even for a single-file read;
the user is asked only **decisions**. [ALWAYS] dispatch `scout` or `web-scout`
and treat the running exploration as an **unsettled prerequisite**: only
downstream questions wait; the rest proceed. Non-blocking by design.

## Exit criteria

- When the frontier is empty, close the last round with `🧭 Frontier: empty`,
  present the synthesis, and wait for explicit user confirmation.
- On rejection, add the correction to the frontier and resume rounds.
  [NEVER] write artifacts before confirmation.
- On confirmation, announce the artifact writes, write `goal.md` and the
  first `decisions.md` entry using the contract below, then report.

## Artifact writes (coordinator carve-outs)

Write `<session-dir>/goal.md` with this structure:

```markdown
# Goal
Status: confirmed
Goal: <one sentence>
Original prompt: <verbatim>
Decisions:
- D1: <decision>
Constraints:
- <constraint>
Assumptions:
- <flagged low-impact decision>
Success criteria:
- <observable outcome>; verify: <how to observe it>
```

Include 1-3 success criteria at outcome level. [NEVER] name implementation
details or tests in them. Use the same `D<N>` identifiers in both files and
`- none` for an empty list.

Write `<session-dir>/decisions.md` with this structure:

```markdown
# Decisions
## <YYYY-MM-DD>: <goal>
- D1: <decision>; rejected: <alternative>; reason: <short reason>
```

Use one line per load-bearing decision and `rejected: none` when applicable.
Both writes are coordinator carve-outs. [NEVER] delegate them; [NEVER] let a
subagent write into `<session-dir>`.

## Reporting

- The pre-confirmation synthesis covers the goal, shaping decisions,
  constraints, assumptions, and success criteria. [NEVER] a bare "done,
  continue". Trivial goal: collapse the synthesis to one line.
- After writing, report both paths without repeating the synthesis.

## Anti-patterns

- Running the quick scan as a full investigation, or starting to build.

## Critical

**[NEVER]** proceed to implementation if this skill is called.
**[NEVER]** skip the grilling, that's *the whole point* of this skill
