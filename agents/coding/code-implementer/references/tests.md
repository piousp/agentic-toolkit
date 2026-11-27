# Unit and Component Tests

Read this when you plan the tests of a seam, when a boundary or a branch is unclear, when the existing test conventions conflict, or when a test's value is in doubt.

## Scope: the plan decides the coverage

When the dispatch carries a `code-planner` step, the test lines of that step are the coverage contract: implement those lines, and a boundary or a branch without a line is a Flags entry, never a test you add on your own. The boundary-and-branch doctrine below governs the tests you design yourself, when no plan names them.

## Plan the tests

Identify what the step does that existing tests do not cover:

- New behavior → write new tests.
- Modified behavior in an existing method → edit the existing tests that covered the old behavior so they assert the new behavior, before changing the code.
- [DO NOT] test code unrelated to the step.
- [DO NOT] test code from libraries: the libraries already have their own tests.

Cover the edge cases of the behavior under test; the coverage section below defines what counts as a boundary and what as a branch. Name tests for the behavior they verify, following the repository's naming convention.

Place new tests in the EXISTING test class for that service, unless the caller names a new file. When no test class exists, create one next to the closest sibling test class, following its naming and framework, and say so in Flags. When the project has no test framework, [DO NOT] add one silently: that is STOP-1.

One line per test, grouped by the seam that covers it:

`<seam> | <test name: the behavior> | <input> → <expected> | boundary or branch | <test class>`

```text
Calculator.divide | divideByZeroDenominatorThrows | (10, 0) → ArithmeticException | boundary | CalculatorTest
```

When the caller dispatched a `code-planner` step, this format is the plan's own test line: one line, one cycle.

## Match existing conventions before asserting

See "Before Coding" in `skill:pablo-coding-style` for the general principle: check the closest precedent, verify against a broader search, surface conflicts. Applied to tests:

1. Treat the immediate sibling test — same file, same endpoint or feature, the closest analogous case — as the default precedent.
2. Separately search how the same kind of assertion is done elsewhere in the suite, with a search that can also confirm absence, not only presence.

If the sibling and a broader match disagree, [DO NOT] pick one silently: name the conflict in Flags.

## Checklist: is this test worth keeping?

- Falsifiable: breaking the logic it covers turns it red.
- Reproducible: same result on every run; no shared state, clock or randomness it does not control.
- One logical assertion per test.
- Simple and straightforward, with the fewest assumptions possible.
- Describes WHAT, not HOW.

## How many tests: cyclomatic complexity and branch coverage

The higher the cyclomatic complexity, the more tests the code needs: every decision path is behavior. Two coverage kinds get mixed up; keep them apart:

- **Boundaries**: limit values of the inputs — nulls, empty, zero, extremes, error paths. Across the tests of a seam, every parameter under test gets its boundary values, each in its own test.
- **Branches**: each if/else, switch/match, guard clause; every decision path *inside the confirmed seam* is tested.

Effort concentrates on critical paths and complex logic, not on every edge case across the repository.

Worked example: `divide(x, y)`.

- Boundaries of x and y: x > 0, x = 0, x < 0, x = null; the same for y, with y = 0 as the division-by-zero error path. Extremes: `divide(Integer.MIN_VALUE, -1)` overflows in Java, where plain `/` silently returns `Integer.MIN_VALUE`; a test pins the contract the code chooses, that value or an exception.
- Branch: `if (x == y) return 1` is a shortcut with priority over the y = 0 error path. It needs its own tests: `divide(5, 5) == 1` (the branch fires on equal operands), `divide(0, 0) == 1` (the shortcut beats division by zero; removing it makes `divide(0, 0)` throw), and `divide(null, null) == 1` (the shortcut fires before the null unboxing). In Java, compare with `Objects.equals` (value equality, null-safe); `==` on boxed `Integer` is reference equality.

## Anti-patterns

- **Implementation-coupled.** Tests internal structure, mocks internal collaborators, calls private methods, asserts call counts or call order, or names the test for HOW instead of WHAT. The tell: the test breaks on a refactor while behavior is unchanged. Exception: when the behavior *is* an effect on an external system — an email sent, a card charged — verifying that call and its arguments on the boundary mock is the assertion. [NEVER] verify calls on internal collaborators. Scoped to `mode: tdd`: it governs that mode alone, because in `mode: refactor` the architecture assertion of a step of shape reads the structure the step declares, and that is the legitimate case it does not cover.
- **Tautological.** The assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`), so it passes by construction and can never disagree with the code. Expected values [MUST] come from an independent source of truth: a known-good literal, a worked example, the specification.
- **Horizontal slicing.** All tests written first, then all implementation. Bulk tests verify imagined behavior: they test the shape of things rather than user-facing behavior, go insensitive to real changes, and commit to a test structure before the implementation is understood. [ALWAYS] work in vertical slices: one test → one implementation → repeat, each test a tracer bullet that responds to what the last cycle taught.
- **Bypassing the interface.** Verifies through a side channel, such as querying the database directly, instead of using the public interface the caller would use. The offense is in verification, not setup: mocking the repository or DAO that fronts the database, or seeding a test database, is legitimate; the test must still assert through the public interface.

## Integration-style tests

An "integration-style" section is not a fifth anti-pattern: the good case shows behavior through the real flow; the bad case, asserting that an internal collaborator was called, is an instance of the implementation-coupled anti-pattern, under the `mode: tdd` scoping that pattern carries.
