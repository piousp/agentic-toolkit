# Test Planning

This reference covers unit and component tests that run in process. Integration and end-to-end suites follow the conventions the repository already has, and the plan cites them instead of inventing them.

## Behavior and placement

Separate new behavior from modified behavior before you write a line. New behavior earns new tests. Modified behavior starts by changing the existing test that pinned the previous behavior — that test is the specification of what changed, and it changes first.

Test the change, nothing adjacent: no tests over code the objective does not touch and no tests over a library the repository consumes. A gap you notice outside the change is reported, not covered.

Place tests by precedent. Reuse the existing test class. When none exists, follow the nearest sibling — the test class for the closest unit of the same kind — as the precedent for framework, naming, fixtures and location. Search broadly, and independently of the files the objective names, so that "there is no sibling" is a finding rather than an assumption; declare the conflict when two conventions compete instead of picking one silently.

When no framework exists for the change, or the repository holds two that could apply, that is a `Q<n>` with a recommended answer. A silent choice of framework is a decision the caller never made.

## Seam confirmation and vertical slices

The test seams of a plan are proposed, not agreed. They stay proposed until someone with authority approves them, and the caller can carry the user's approval back to you; you never convert a proposal into a confirmation on your own.

Plan one tracer bullet per cycle: a single test that fails, the minimal implementation that makes it pass, then the next test. Vertical slicing — one behavior end to end at a time — keeps every step observable; horizontal slicing (all the data layer, then all the service layer) hides the first working path until the end.

During implementation, report by seam: finish one seam before opening the next, so the report names the seam that is done and the behavior it now guarantees.

There is no acceptance criterion per seam. Acceptance is per scenario, `Given-When-Then`, and done is per increment: seams confirmed, boundaries and branches covered, the affected suite green, and the run cited.

## Boundary and branch coverage

Cover the boundaries of each parameter: null, empty, zero, the smallest and largest values the type admits, and the error paths the contract declares. Cover the branches inside the seam: every `if`, `else`, `switch` case and guard.

A worked example, a division contract: numerator and denominator, with a rule that equal operands return an early `1` before any error check. The cases to plan:

- denominator zero → the declared error, not an exception escaping the contract
- both operands positive → the quotient
- numerator zero, denominator non-zero → zero
- negative operands, in each sign combination → the sign the specification states, since language semantics differ on rounding toward zero
- null in either position → the declared rejection of an absent value, before arithmetic
- overflow of the result type → the declared behavior, which is either a wider type or an error
- the equality shortcut fired before the error check: `(5,5)` → `1`, `(0,0)` → `1` if equality precedes the zero check, `(null,null)` → the declared value for two absent operands, never an accidental match on two nulls

The last group is the one that catches an ordering defect: a guard placed after the shortcut returns a wrong answer for inputs the error path was supposed to own. Plan those tests explicitly rather than trusting the branch count.

## Tests worth keeping

A test worth planning is falsifiable (a wrong implementation fails it), reproducible (same input, same result, no ambient state), one logical assertion, simple enough to read in one pass, and about behavior and its reason rather than about the code that delivers it.

Four anti-patterns to keep out of the plan:

- **Implementation-coupled.** Asserts an internal call, a private step or a mock interaction that the behavior does not require.
- **Tautological.** Computes the expected value with the same code or the same formula the test is checking, so it passes whatever the code does.
- **Horizontal slicing.** Plans the whole data layer before any behavior is observable, so no test can fail for a reason the plan names.
- **Side-channel verification.** Checks a log line, a counter raised elsewhere or a file written as a side effect instead of observing the returned behavior.

The expected value comes from an independent source: a known literal, a worked example, or the specification. When none of the three settles it, mark the expectation `[ASSUMED]` in the plan rather than deriving it from the implementation.

## Principles applied to tests

The principles of the coding style, read through a test file:

- **DRY, with KISS winning.** Test setup is extracted at its third copy, into a helper or a parameterized test. When the helper makes the test harder to read, the duplication stays: a test that cannot be read in one pass has lost its purpose.
- **YAGNI.** A fixture builder, a factory or a base test class exists when the tests already justify it, never in anticipation of tests nobody wrote.
- **Fail loud.** The failure names what was expected, what was found and where. A test whose failure message does not localize the defect is a test that costs more than it saves.

## Mocking at system boundaries

Mock at the system boundary and nowhere else. The boundaries that justify a test double:

- an HTTP client or vendor SDK
- a repository or DAO
- the clock or a source of randomness
- a filesystem wrapper, when a temporary directory is not enough

Repository tests that run against a test database follow the repository's conventions: cite the existing suite rather than prescribing a new one.

No mocks of domain services or of internal collaborators: a test that mocks its own collaborator is asserting a call graph, not behavior. Depend on the boundary by injection — an interface specific to the SDK the system uses, defined where the system uses it — instead of one generic fetcher with conditionals inside it for every call shape.

## Red-green evidence to plan

The red step fails for the behavior under test, not for a compile error, a missing import or a broken setup. When the unit cannot be reached yet, plan a minimal stub that returns the wrong answer, so the failure is the assertion and nothing else.

A new test that comes up green on its first run proves nothing until a mutation check shows it can fail — break the implementation deliberately in your description of the run and confirm the test catches it. A characterization test is the exception: its job is to pin current behavior, not to fail.

The green step is the minimal implementation plus the affected suite, and the plan names the command and the expected result. Where no run happened, the plan says so: no green claim without a real run, and no red claim either.

Modified behavior starts with the existing test, and no assertion is deleted or relaxed to reach green. A failure outside the change stops the work and is reported: it is evidence about the system, not an obstacle to route around.

Source: Matt Pocock, TDD and mocking guidance, adapted here as planning rules rather than implementation instructions.
