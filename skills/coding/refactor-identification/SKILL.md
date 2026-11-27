---
name: refactor-identification
description: >-
  Finds refactor candidates in exactly four structural categories (missing or misplaced
  abstractions, weak encapsulation, poor data types, flag/enum-modeled variants), each measured
  against an occurrence threshold. Two exclusive modes: diff mode reads the branch change or the
  diff the caller hands over, area mode reads a selector the caller declares (function, class,
  module or repository). Use for "refactor candidates", "is a refactor worth it in this change",
  or "what should I refactor in this area". [DO NOT] use for renames, for applying a refactor or
  writing implementation steps, for a simplification or cleanup plan, for bugs, for merge or PR
  verdicts, for risk assessment, or to read code outside the scope the run declared.
summary: Quantifies structural refactor candidates in a diff or a declared code area.
---

# Refactor Identification: Structural Candidates in a Frozen Scope

Use this lens for a deep, quantified dive on exactly four structural categories, when the question
is not "does this change pass review" but "is there a structural refactor worth investing in
here". A broader review pass already covers part of A1 superficially as one item of a fast merge
gate; reach for this lens when that surface-level pass isn't enough, and see Boundaries for the
split. Identify candidates only: never execute a refactor, and never explain how to apply a
pattern once one is chosen. A finding's direction line names the target shape and stops there.

One run has one mode, fixed at step 1 and never mixed. **Diff mode** reads the change the caller
hands over or the branch's own diff. **Area mode** reads a scope the caller declares by selector.
A run never reads a diff hunk and a declared area in the same pass.

## Scope law

The frozen scope is the only place a finding can anchor. It is fixed once and never widened
afterwards. Two rules apply unchanged in both modes: occurrence counting (`### Occurrence
counting`) and the evidence radius (`### Evidence ceiling`). Anchoring is the same sentence in
both modes, read against a different scope: every finding needs at least one `file:line` inside
the frozen scope, and a finding without one does not exist for this lens (N4).

### Diff mode

Scope is the change this branch carries, or the diff the caller hands over.

1. **Derive the diff.**
   - If the caller's prompt already hands over a diff (a path to a diff file, a commit range, or
     diff content), use exactly that. Do not go looking for a different diff and do not ask.
     Content the caller declares as "the diff in full" makes every line an added line. A file,
     function, or directory handed over without that declaration is not a diff: derive the diff
     as below, and its lines outside that diff anchor nothing (N4).
   - Otherwise derive it yourself: `git diff` (unstaged), `git diff --cached` (staged), or
     `git diff main...HEAD` (full branch). Ask for the parent branch only when invoked standalone
     and it isn't obvious.
   - If the diff cannot be derived (a supplied path, range, or base ref does not exist, or git
     fails), emit the Blocked form (Output format) and stop; never substitute another base.
2. The anchor in this mode is a changed hunk, or a symbol the branch changed.
   Verify: you can list every changed file with its hunks.

### Area mode

Scope is declared by the caller as a selector, with exactly one granularity:

| Granularity | Selector form | Frozen scope |
|---|---|---|
| `function` | `path:symbol` | the named function or method body, header and body only |
| `class` | `path:symbol` | the class or type declaration with all its members |
| `module` | a directory path or a file path | every source file under that path |
| `repository` | the repository root | every source file, minus generated, vendored and build output |

- The selector is used as given. A run never widens it, never adds a second selector, and never
  mixes it with a diff.
- The anchor in this mode is a line inside the frozen selector. A line outside it anchors nothing,
  even when it holds an identical copy of the smell.
- A symbol that resolves to no declaration, or to more than one, emits the Blocked form and stops.
  Never pick one silently, never resolve by proximity, never fall back to the file.
  Verify: every selector resolves to a named target, and the target set is recorded beside the manifest, never folded into it.

### Occurrence counting

The A1 and A2 thresholds count occurrences, so counting has one law per mode and never originates
a candidate.

- **Diff mode.** Once a candidate is anchored inside the diff, a repo-wide grep is allowed solely
  to count how many occurrences exist in total. That grep never originates a candidate; it only
  measures one already anchored.
- **Area mode.** The frozen selector defines the counted universe: an occurrence inside the
  selector counts, and the same anchored grep may count outside it only to decide whether a
  threshold is met. An occurrence outside the selector never becomes its own candidate row (N4).
- **Both modes.** Exclude generated, vendored and build-output paths. Record the exact search
  command and its hit count in the measure. A count without its command is not a measure, and it
  covers only what the command matches. A zero-hit grep outside the frozen scope establishes
  local absence only, never runtime unreachability (N9).

### Evidence ceiling

- **1-hop radius.** For each symbol in scope you may read (a) the full contents of its containing
  file, (b) files that directly define or use that symbol (a code-navigation or indexing tool if
  the repo has one, otherwise grep), and (c) the public signatures, not the bodies, of types the
  lines in scope call, solely to detect an existing helper being re-implemented. Do not expand
  further than one hop.
- Code and config read within that radius, and the tests that exercise them, are what settle a
  candidate. Documentation, wikis, comments and domain knowledge may motivate a hypothesis; they
  never decide a gate row or a finding by themselves.
- If adjudicating a candidate needs a fact beyond the radius or outside this repo, including a
  fact only documentation claims, do not infer or derive it: name the exact lookup that would
  resolve it (repo, symbol or path, what to check) and route the candidate per the N9 row. The
  radius never widens.

## The four categories

One identity, four categories, one gate. Each row carries its threshold and the rule that governs
it, in the same place, so a candidate is judged without opening another artifact. Applying the
pattern stays out of scope: the direction line names the shape and stops.

| ID | Category | Definition | Threshold | Governing rule |
|---|---|---|---|---|
| A1 | Missing or misplaced abstractions | One reason to change where there are two; the same structural or business logic duplicated; inheritance used for reuse rather than variation; separable phases mixed in one body | Duplication of 2 or more occurrences, structural or business, unless the row says otherwise | The DRY structural exception (the same algorithm for two types is a missing type parameter, abstract at 2) plus an explicit override of Three Strikes: business duplication also counts at 2, because the owner's review rule wins; KISS still gates the extraction (N3) |
| A2 | Weak encapsulation | Mutable state exposed, invariants unprotected or checked by callers instead of by the object, query mixed with mutation, hidden ambient dependencies, read-through delegate chains | 1 occurrence inside the frozen scope, unless the row says otherwise | An invariant belongs where the state that carries it lives, and holds at every entry point; a check repeated at the call sites is the same rule in the wrong place |
| A3 | Poor data types | A primitive or a data clump carrying a domain concept, absence or failure encoded outside the return type, a field another field already carries, a mutable value aliased, an untyped value crossing a boundary | Varies per smell, see the A3 rows | Data structures first: every value the type can take names a domain case, and a value that stays local earns no type (N7) |
| A4 | Flag/enum-modeled variants | A discriminator (boolean, enum, string) driving dispatch that a closed variant set with exhaustive matching would express directly | Varies per smell, see the A4 rows | A closed set of variants is the one hierarchy worth keeping (Liskov, composition over inheritance); below genuine variation, a type per variant is ceremony (N5) |

### A1: Missing or misplaced abstractions

A class or function carries more than one reason to change, the same shape of logic is
copy-pasted with only the types or literals differing, it inherits for reuse rather than
variation, or it mixes separable phases in one body.

| Smell | Detection cue | Evidence to record | Threshold | Governing rule |
|---|---|---|---|---|
| Structural duplication (same algorithm, different type) | Two functions or methods identical modulo types: same pipeline shape (`map`/`filter`/`reduce` chains), same control flow, only the types or field accessors differ. At least one copy inside the frozen scope; count the rest with the anchored grep | Both `file:line` spans + "identical modulo type: `<T1>` vs `<T2>`" | 2 or more occurrences | The DRY structural exception: two copies of one algorithm over two types are a missing type parameter, so it is abstracted at the second copy, not the third |
| Inline re-implementation of an existing helper | Lines in scope re-implement what an existing named helper, predicate or constant already provides, found through the 1-hop public-signature read | The scope `file:line` that re-implements it + the existing helper's `file:line` | 1 (the existing helper is the other copy) | Reuse existing code over writing new code: the helper already in the repo is the second copy, so the count needs no grep |
| Business-rule duplication | The same domain decision, one predicate over the same domain fields, encoded in several places; literals and field names match even where the syntax differs | All `file:line` sites + the rule in one sentence | 2 or more occurrences, at least 1 inside the frozen scope | Three Strikes (wait for the third occurrence before abstracting) is overridden here at 2, because the owner's review rule wins; the N2 check still asks what each predicate accepts, and an extraction crossing a module boundary or a public contract is P3 |
| SRP violation in a class in scope | Methods or fields in scope serving a second axis of change: imports or collaborators from an unrelated domain, methods that share no fields with the rest of the class. Does not count: an injected collaborator with no in-repo reader, which is dead code, not an axis | Class `file:line` + the 2 or more axes of change + the members' lines that carry the second axis | 2 or more distinct reasons to change, at least 1 of them in scope | One class, one axis of change: the row measures a second axis present inside the scope, not class size or line count |
| OCP violation (dispatch modified, not extended) | A `switch`/`if-else` chain selects behavior, so that one more variant has to be written as another case in the chain instead of arriving as a new implementation | Chain `file:line`, the case or branch that carries the variation, and the chain length | Diff mode: chain length of 3 or more after the change. Area mode: chain length of 3 or more inside the frozen scope | Behavior is extended by a new implementation, not by editing the dispatch; under three cases the extra indirection costs more than the branch |
| Misplaced logic (feature envy) | A method in scope calls 3 or more getters or fields of one foreign type and at most 1 of its own class; the computation belongs on the foreign type | Method `file:line` + "N foreign accessor calls vs M own" | 3 or more foreign accessor calls | The data and the rule over it live together: the type whose fields a method mostly reads owns the computation |
| Inheritance used for reuse, not variation | A subclass shares fields or methods with its parent and varies nothing: it overrides only to leave a method empty or pass-through, or overrides nothing at all. Does not count: a subclass the framework or the language requires, a closed variant set (that is A4), or a base class holding only fields and getters | Subclass `file:line` + the parent member it reuses or leaves empty | 1 occurrence inside the frozen scope | Composition over inheritance, except for a closed set of variants (Liskov): the row fires only when composition carries the same state without an is-a claim, so call-super and yo-yo style nitpicks do not qualify, and the direction is replace subclass or superclass with delegation |
| Mixed-phase function (no split phase) | A method in scope does two genuinely separable jobs end to end in one body, with no named structure between them; phase-1 locals feed phase-2 logic across a long body | Method `file:line` + the two phase line ranges, one sentence each | 2 or more independently nameable phases | Separate the pure transformation from the side-effecting steps and sequence them explicitly |

### A2: Weak encapsulation

State that should be private and self-protecting is instead exposed, mutable, or trusted to be
validated by every caller; or a method mixes query with mutation, reads ambient state, or reaches
through a delegate chain.

| Smell | Detection cue | Evidence to record | Threshold | Governing rule |
|---|---|---|---|---|
| Public mutable field | A field reassigned after construction, or an `interface`/`type` property with no `readonly` that the code mutates | `file:line` of the declaration | 1 | Immutability first: a field that never changes after construction needs no setter and no guard |
| Mutable internals escaping | An accessor returns an internal mutable collection, array or object without a copy or a read-only wrapper (`readonly T[]`, `ReadonlyArray<T>`) | Accessor `file:line` + field `file:line` + "escapes: `<type>`" | 1 | Immutability first: a getter hands out a value, not a handle another owner can mutate through |
| Invariant bypassed by mutator | A constructor or factory validates a condition that a later setter, mutator, spread or `Object.assign` on the same field does not | Validation `file:line` + unguarded mutator `file:line` | 1 | An invariant holds at every entry point or it does not hold; one guarded path and one unguarded path are the same state under two rules |
| Invariant enforced by callers (check-then-act) | Two or more call sites perform the same precondition check before calling the same method; the check belongs inside the callee | Each caller `file:line` + callee `file:line` | 2 or more call sites, at least 1 inside the frozen scope | The check belongs where the state is, stated once; repeated at the call sites it is one rule sitting in the wrong place |
| Mutation through reached-into internals | Code in scope does `a.getB().getC().setX(...)` or `a.b.c = x`, mutating another object's internals through a chain | `file:line` of the chain + depth | Chain depth of 2 or more with a terminal mutation | An object's internals are mutated by the object that owns them; a chain reaching a mutable field crosses two ownership boundaries |
| Query and mutator mixed (CQS violation) | A method returns a value and also mutates a field of `this` or a mutable argument passed in, in the same call. Does not count: a local accumulator that dies with the stack frame, an idiomatic query-and-mutate operation (`Array.prototype.pop`, a fluent setter returning `this`) | Method `file:line` + what it mutates vs what it returns | 1 occurrence inside the frozen scope | Referential transparency: a call that both answers and mutates makes the answer depend on the history of calls, not on its arguments |
| Hidden dependency on ambient state | A method in scope reads a global, a singleton, an environment variable, `Date.now()` or `Math.random()` directly instead of receiving it as a parameter, so it cannot be exercised in isolation. Does not count: a logger, or a module-level immutable constant | Method `file:line` + the ambient source read | 1 occurrence inside the frozen scope | Scientific code: same input, same output; an input missing from the signature makes the unit untestable in isolation |
| Read-through delegate chain | Code in scope reads, without mutating, through a chain of 3 or more accessors, to reach a value that belongs closer to the first object, repeated at 2 or more sites | Each chain `file:line` + depth | Depth of 3 or more, 2 or more occurrences | Composition, not delegation depth; a new middle-man wrapper is itself an abstraction, so KISS gates it (N3) |

### A3: Poor data types

Domain concepts are carried by bare primitives or by absence outside the type, expected outcomes
are signaled by throwing instead of by the return type, a field stores a value it could derive, a
mutable value is aliased where it should be copied, or a value with a known domain shape crosses
a boundary untyped.

| Smell | Detection cue | Evidence to record | Threshold | Governing rule |
|---|---|---|---|---|
| Primitive obsession | `string`/`number`/`boolean` carrying domain meaning (id, ISO code, currency, email, status) crossing signatures, or the same primitive format validated in several places. Does not count: an opaque identifier the code only passes, stores or compares without adding parsing, validation or formatting; never propose an id wrapper for it | Each signature `file:line` + the domain concept name | Crosses 3 or more signatures in scope, OR validated in 2 or more places | Every value the type can take names a domain case: a `type Email = string` alias brands nothing and buys no safety, while an opaque id adds ceremony only |
| Stringly-typed state | A field or variable compared against string literals to branch, or a set of 2 or more string constants declared as the allowed values of one field | Each comparison `file:line` + the literal set observed | 2 or more distinct literal comparisons on the same value; or 1 declaration in scope of 2 or more string constants that are the allowed values of one field | The legal set belongs to the type; literals compared at each site duplicate that set wherever they appear |
| null as domain absence | A return of `null` or `undefined` for an expected "not found" or "missing", with callers guarding through `?.`/`??`/`!`, or optional `?` members and non-null assertions standing for the same absence | Producer `file:line` + each guarding caller `file:line` | 2 or more guards, or 1 non-null assertion | Typed error handling: an expected absence is a case of the return type, not a value every caller must remember to check |
| Exceptions as control flow | `throw` for an expected domain outcome (validation failed, not found) with a caller that catches to branch on it | `throw` `file:line` + catching caller `file:line` | 1 (a throw-and-catch pair present) | Exceptions are for unrecoverable conditions; an expected domain failure is a case the return type carries |
| Data clump | The same group of 3 or more members travelling together through several signatures, same names and types in the same order; an inline object shape with no named type | Each signature `file:line` + the clump members | Group of 3 or more members in 2 or more signatures in scope (an interface method, its implementations and overloads count as one signature) | Data structures first: a group that always travels together is one value; under three members it is a parameter list, not a clump. A grouping imposed from outside — by a framework, a library, or the type of a boundary this code does not own — is not a clump: the candidate is the grouping this code chose, not the one it was required to adopt |
| Redundant derived field | A field stores a value already derivable from another field the same object holds, at the point of use, and the invariant that makes the derivation total is visible in the same file | Field `file:line` + the field it duplicates | 1 occurrence, derivation invariant visible locally; otherwise N9 | No field that another field already carries: derive it at the point of use, and only where the invariant making the derivation total is real and visible in the same file |
| Shared mutable reference used as a value | An object with no identity meaning (an amount, a range, a coordinate) is passed or stored by reference and aliased across 2 or more owners, so mutating one silently affects the other | Alias site `file:line` + mutation site `file:line` | 1 occurrence of aliasing plus mutation on the same reference | Structural equality is not identity: a value with no identity is copied, not aliased |
| Untyped boundary value | `any`, or an unbounded `unknown`, on a signature, field or generic argument that crosses a module or I/O boundary where the value has a known domain shape | Each `file:line` + what the value actually is | 1 occurrence; local to one function and crossing no signature: N7 | A boundary is where the domain shape is known and cheapest to state; inside one function that crosses nothing, the annotation buys no safety |

### A4: Flag/enum-modeled variants

A discriminator drives behavior that varies by case, in a shape a closed variant set with
exhaustive matching would express more directly.

| Smell | Detection cue | Evidence to record | Threshold | Governing rule |
|---|---|---|---|---|
| Duplicated dispatch over the same discriminator | Two or more `switch`/`match`/if-else chains over the same enum, flag or string discriminator, where variants carry different data or behavior; the discriminator's declaration is the root-cause line and each dispatch site is an occurrence | Each dispatch `file:line` + the discriminator + variant count | 2 or more dispatch sites | The same decision written twice: behaviors that already exist as alternatives become substitutions (Strategy) instead of repeated branches |
| Type-check cascade on a union | `typeof`/`instanceof`/`Array.isArray` cascades, a union narrowed with `'field' in obj` or truthiness, or a discriminated union switched with no `never` check | Cascade `file:line` + branch count + what should be the discriminant | 2 or more branches | A closed variant set carries one discriminant and an exhaustive check, so a new variant breaks the build instead of falling through |
| Mode field checked across methods | A status or mode field checked at the top of several methods of a class in scope (State candidate, direction only) | Field `file:line` + each checking method `file:line` | 3 or more methods check the same field | A mode checked at the top of nearly every method is a type per state (State); below that it is a field |
| Nullable members as variants | An `interface` or `type` whose optional members are only meaningful for some values of a discriminator: guards conditioned on it, comments like "only set when..." | Type `file:line` + the discriminant + the conditional members' lines | 1 type with 2 or more discriminator-dependent members | Every value of a type must name a domain case: members meaningful for one variant are that variant's own payload |

## When NOT to report

Check every candidate against the rows below in this order and stop at the first row that applies:
N4, N10, N8, N1, N2, N5, N6, N7, N3. Cite only that row, never stacked rows as rhetorical
reinforcement. If the fact that decides a row lies outside the 1-hop radius or outside this repo,
stop at N9 instead. A candidate matching N9 moves to Unresolved, or to one Filtered out line, as
the N9 row says; a candidate matching any other row moves to Filtered out with that row's ID; a
candidate no row applies to passes to Findings. No candidate is silently dropped. A passing
candidate's gate note names the closest row and the fact that rules it out.

"Filtered out" describes why this lens does not surface the item as a structural refactor
candidate in this scope. [NEVER] treat it, or a cited row ID, as a claim that the code is wrong,
risky, unsafe, or should be rejected.

Rows can be logically incompatible: N8 (rename, formatting, trivial, behavior-preserving by
definition) cannot co-apply with any argument that the candidate changes behavior, and N1 (only
one variant exists) cannot co-apply with N2 (different business rules exist). Citing incompatible
rows together means the candidate is misclassified; stop and re-derive.

| ID | Situation | Governing rule | Action |
|---|---|---|---|
| N1 | Only one variant or implementation exists in the scope and nothing in it shows a concrete second one (A1 and A4 only; never filters an A3 closed value set) | YAGNI, no imaginary flexibility | Filtered out |
| N2 | The similar blocks encode different business rules that change for different reasons (accidental duplication) | DRY versus SRP, SRP wins | Filtered out |
| N3 | The abstraction removing the smell would be harder to read than the duplication or conditional it replaces | KISS over DRY, KISS over SOLID | Filtered out |
| N4 | No evidence line falls inside the frozen scope. Diff mode: no line in a changed hunk and none on a symbol the branch changed. Area mode: no line inside the frozen selector, even where an identical copy exists just outside it | Scope law, declared scope only | Filtered out |
| N5 | A flag or mode has exactly 2 simple states with a trivial behavior difference | A type per state only earns its cost past this point | Filtered out (A4) |
| N6 | A single failure point already handled inline by the immediate caller | A typed-absence carrier is ceremony here | Filtered out (A3) |
| N7 | A primitive, a clump or an untyped value stays local: it crosses no signature boundary and is validated in fewer than 2 places | KISS, a domain type adds ceremony | Filtered out (A3) |
| N8 | The "finding" is really a rename, formatting, or a trivial extract-method in disguise; extracting a helper that removes a duplicate copy is never N8 | Non-structural, out of scope for this lens | Filtered out |
| N9 | The candidate's disposition depends on a fact outside the 1-hop context or outside this repo (reachability, another service's behavior, a runtime data layout) | Scope law, cannot be adjudicated here | Unresolved only if the answer could make it P1 or P2; otherwise, including a candidate rooted in another repo, one Filtered out line naming the repo or the fact |
| N10 | Every evidence line lives in test, spec, fixture, or test-helper code, including the main sources of a dedicated integration-test module | Test duplication is often deliberate clarity; test-structure quality is out of scope for this lens | Filtered out |

N2 check: compare what each predicate or block accepts, its extension, not the polarity of its
call sites. If one's accepted set is a superset or a subset of the other's, they are not different
rules and N2 does not apply.

N3 check: "harder to read" explicitly includes hiding an effect. If the abstraction that removes
the duplication would fold a mutation, a metric, a log, or any other side effect that each
duplicated site currently performs in plain sight into a single method's body, N3 applies: a few
duplicated, explicit lines beat one abstraction with hidden effects. In the gate note of every A1
structural-duplication candidate whose direction merges call sites that mutate state, name N3 as
the closest row.

## Priority assignment

The cascade depends on the mode: diff mode reads the branch, area mode reads the frozen scope.
Within a run, assign only by the table of that mode, and stop at the first match.

### Cascade in diff mode

| Order | Priority | Mechanical rule (every condition checkable) |
|---|---|---|
| 1 | P3 | The fix exceeds the 1-hop context, crosses a module boundary, or changes a public contract that already exists on the base ref (an API, endpoint, or message/database schema consumed outside its module) → follow-up material, a separate task, never inline |
| 2 | P1 | The branch adds or worsens the smell's root-cause line (the declaration, definition, or dispatch site actually being flagged, not merely a call site or check site referencing it; a duplicate copy the branch adds counts; for A4 "Duplicated dispatch over the same discriminator", the discriminator's declaration is the root-cause line and each dispatch site is an occurrence) AND the fix stays within files the branch already changed |
| 3 | P2 | Any other anchored candidate: the root-cause line pre-exists and the branch only adds a new occurrence, case, or call site that references it, or the fix also touches an unchanged 1-hop file |

A root-cause line the branch edits without introducing or worsening the smell (retyping a
pre-existing `string` parameter to a numeric type) counts as pre-existing, and so does a line the
branch only moves or renames with unchanged content. Mixed evidence, a pre-existing root cause
plus branch-added occurrences, follows the root cause: P2, not P1 (`references/examples.md` A3).
The copy the branch adds in `references/examples.md` A1 is itself a root-cause line, so A1 is P1.
`references/examples.md` A4 is P3: its fix edits a dispatch site that only the occurrence count
reached, outside the 1-hop radius.

### Class and order in area mode

Part one fixes the class with no metrics at all:

| Priority | Mechanical rule |
|---|---|
| P1 | The root-cause line is inside the frozen selector AND the fix fits inside files this run already opened |
| P2 | The root-cause line is inside the frozen selector but the fix needs a file the run has not opened yet |
| P3 | The fix crosses the selector boundary, or it does not fit the round cap of the phase that consumes this run: the fixes that phase can apply before the scope is re-frozen |

Part two orders candidates inside their class, without a cut and without a percentile:

1. **Activity**: run `git log --oneline -- <path of the root-cause line>` and record the command
   with its commit count as an observed value. More commits first.
2. **Debt**: on a tie, order by occurrences inside the scope plus the number of A rows the
   candidate touches. More debt first.

## Measurement

- **Anchor**: the frozen scope plus a sha256 manifest, one line per file in scope
  (`<sha256>  <path>`), taken from the state read at freeze. The digest is the identity of the
  run; a file that changes afterwards makes a different scope, and the run says so instead of
  silently re-reading it. The area-mode header prints the digest; in diff mode the `Base` field
  identifies the scope.
- **`base_ref`**: git metadata, optional, recorded only when the working tree is clean
  (`git status --porcelain` empty at freeze). On a dirty tree the base is a claim, not a fact:
  record `Base: absent`.
- **Receipt, not baseline**: every value measured at freeze, including occurrence counts with
  their command, the target count and the activity numbers, lands in the run's receipt. Nothing
  is persisted across runs and nothing is compared against a previous run.

## Step-by-step process

```
1a. Diff mode: derive the scope per Scope law > Diff mode, from the caller's diff exactly as
    given, otherwise from `git diff`, `git diff --cached` or `git diff main...HEAD`; on failure,
    emit the Blocked form and stop.
    Verify: every changed file is listed with its hunks.
1b. Area mode: freeze the caller's selector per Scope law > Area mode, one granularity only, and
    resolve every symbol to exactly one declaration. An unresolved or ambiguous symbol emits the
    Blocked form and stops; never resolve silently.
    Verify: every selector maps to a target, and the target set plus the manifest is recorded.
2. Build the scope table: one row per file of the frozen scope, with its path, language
   (TypeScript), and the lines the frozen scope covers. A file in any other language, or a
   generated, vendored, or build-output file (a `@Generated` or "do not edit" header, `dist/`,
   `build/`, `node_modules/`, `vendor/`), gets language `out of language scope` and yields no
   candidates.
   Verify: row count == number of files in the frozen scope.
3. Expand context, 1 hop max: for each symbol in scope you may read (a) its full containing file,
   (b) files that directly define or use it (a code-navigation or indexing tool if the repo has
   one, else grep), (c) public signatures, not bodies, of types the lines in scope call.
   Verify: every context file read maps to a named symbol in scope.
4. Detection pass A1 over the frozen scope plus context, using the A1 rows and the cues in
   `references/typescript.md`. Record raw candidates: category, smell row, file:line list,
   measure.
5. Detection pass A2, same procedure.
6. Detection pass A3, same procedure.
7. Detection pass A4, same procedure.
8. Count occurrences for threshold-based candidates per Scope law > Occurrence counting; update
   each candidate's measure. [NEVER] drop a below-threshold candidate: if the caller's prompt or
   the code in scope points to a copy outside the frozen scope, carry it to step 9 and let N9
   decide; otherwise move it to Filtered out as below threshold.
   Verify: every candidate carried to step 9 meets its row's threshold or points to an
   out-of-scope copy; every count shows its command and hit count.
8b. Merge candidates that share a root-cause line into one RF, since one root cause is one fix:
    the root-cause line is the declaration, definition or dispatch site being flagged, not a call
    site or check site referencing it. Name the merged ones in the Evidence line as
    "also: A<n> <smell row>".
    Verify: no two candidates share a root-cause line.
9. Gate every candidate through the rows in the gate's order. Name the one fact that decides a
   row before picking it. If that fact requires evidence outside the 1-hop radius or outside this
   repo, stop at N9 and never approximate with the closest-looking row. Passing candidates get a
   one-line gate note naming the closest row and the fact that rules it out; failing candidates
   move to Filtered out with the failing row ID; N9 candidates move to Unresolved or Filtered out
   as the N9 row says, with the missing fact named.
   Verify: every candidate appears in exactly one of Findings, Filtered out, Unresolved.
10. Assign P1/P2/P3 by the Priority assignment table of the run's mode, then emit the output
    template verbatim.
    Verify: every finding has a category ID, at least 1 file:line inside the frozen scope, a
    measure, a gate note, and a one-line direction; `Coverage` names every file or hunk in scope
    not read in full, except files listed under `Out of language scope`.
```

Read `references/examples.md` before the first run: a snippet plus the filled block for A1 to A4,
one candidate filtered by the gate, and one candidate filtered by N9.

## Output format

```markdown
## Refactor Candidates: <branch or context>

### Scope
- Diff: <caller-supplied | git diff | git diff --cached | git diff main...HEAD> | Base: <ref | absent>
- Area: <function path:symbol | class path:symbol | module path | repository root> | Targets: <n> | Manifest: <sha256 digest>
- Files in scope: <N> | Context files read (1-hop): <M>
- Coverage: complete | partial (<files or hunks not read, and why>)
- Out of language scope: <files, or (none)>
- Out of contract: <what the caller asked for, and what owns it instead (behavior risk, merge gate)>

### Findings

#### [RF-1] A<n> <smell row name>: P<1|2|3>
- Evidence: `file:line`, `file:line` (<measure, e.g. "2 occurrences, identical modulo type">[; count: `<search command>` -> <n> hits])
- Anchored in scope: `file:line` (<added or modified hunk | symbol the change touched | line inside the selector>)
- Gate: passes; closest row N<k> doesn't apply because <deciding fact>
- Refactor direction: <one line naming the target shape> (direction only, never the how)

#### [RF-2] ...

### Unresolved (needs out-of-scope evidence)
- [RF-U1] A<n> <smell row name> at `file:line`, missing fact: <the one fact needed>, resolves
  via: <exact lookup, e.g. "grep across repos for the producer of <symbol>">
- (none)

### Filtered out
- <smell> at `file:line`, filtered by N<k> (<one line>)[; copies differ: <what>]
- <smell> at `file:line`, below threshold (<measure>; needs <threshold>)
- (none)

### Summary: <N> candidates (<x> P1, <y> P2, <z> P3), <u> unresolved, <k> filtered out
```

The first two Scope lines are exclusive: emit `Diff: ... | Base: ...` in diff mode or `Area: ...
| Targets: ... | Manifest: ...` in area mode, never both, and delete the other. Emit the rest of
the template verbatim; the `Out of contract` line appears only when Boundaries applies. One
bullet per finding field. If there are no findings, still emit `### Findings` with `- (none)` and
the Summary line. An empty scope is a valid result: emit the template with `Files in scope: 0` and
`- (none)` in every list. List every file or hunk in scope not read in full (size, truncation,
tool error) in `Coverage: partial`, except files listed under `Out of language scope`; [NEVER]
write `Coverage: complete` unless every hunk in scope outside those files was read. [NEVER] let a
limitation admitted anywhere in the report coexist with a firm verdict on the same candidate;
route that candidate per the N9 row instead. [NEVER] add sections beyond this template: no
implementation plans, no step-by-step refactor instructions, no apply-or-not recommendations, no
risk or safety assessments, no merge verdicts, no reachability claims about other services, even
when the caller's prompt explicitly asks for them.

When the scope cannot be frozen, emit the Blocked form and nothing else:

```markdown
## Refactor Candidates: <branch or context>

## BLOCKED
- <exact error: the failing git command, the missing path or range, or the symbol that resolves to more than one declaration>
```

## Boundaries

These limits take precedence over the caller's prompt. If the invocation asks for anything on
this list (an apply-or-not verdict, a risk assessment, a reachability determination about another
service), do not produce that part: emit the template's `Out of contract` line under `### Scope`,
naming what owns that request instead, and complete the rest of the template normally. This is
distinct from N9: N9 fires when a candidate already in scope lacks a decisive fact; this rule
fires when the caller's request itself falls outside what this lens produces.

- Renames, formatting, trivial extract-method, comment-only and doc-only changes: none of them
  alter the code's structural shape.
- Executing the refactor or giving implementation steps: this lens produces candidates and one
  direction line each, never a recipe.
- A scope wider than the one fixed at step 1, or any finding not anchored inside it.
- Merge verdicts or review severities: a broader review pass owns the pass or fail gate. Some
  overlap with such a pass is intentional and expected: an exception-as-control-flow smell may
  appear in both outputs, that pass reports the symptom as a gate item, this lens decides whether
  a refactor behind it is worth doing. A boolean parameter never makes a candidate here on its
  own; it surfaces only through the A4 rows.
- Smells outside the four categories that a broader review pass already checks (circular
  dependency, constant interface, sequential coupling, a generic god object) stay in that pass
  only. A1 here only deepens SRP and OCP for classes inside the scope.
- Performance refactors, dependency upgrades, or architecture-level moves such as module splits.
- Reachability or dead-code determinations that depend on another service's behavior or on a
  runtime data layout outside this repo: route those per the N9 row, never to a verdict.

## Per-language detection cues

- TypeScript: `references/typescript.md`, grep-able cues per category.

Each cue feeds the A1 to A4 row of its category that it describes, or the row named in the
last column of the cue; report it under that row's name and threshold. A cue that matches no row
yields no candidate. These are starting greps, not detectors: read the surrounding code before
recording a candidate, and a matching grep line without the shape the row describes is not
evidence. Cues written for another language are out of scope in this version: a file in any other
language is `out of language scope` in the scope table and yields no candidates.
