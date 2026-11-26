# Design Signals

Read this reference when the progressive-disclosure rule of the body sends you here: an A1-A4 signal appeared, an abstraction, interface, adapter, module or seam is about to be proposed, or the deletion test has to be applied. The signals inform decisions; they never issue a refactor verdict.

## A1-A4 calibration

### A1 Missing or misplaced abstractions

- **Mixed reasons to change.** One unit carries two kinds of change — parsing and formatting, policy and transport, validation and persistence — so a request touching one forces a rewrite of the other.
- **Duplication against business knowledge.** Judge the copies by what they know, not by how they look: two blocks that repeat a business rule are one abstraction misfiled; two blocks that happen to look alike but answer to different owners are not. Structural duplication is a hint; shared knowledge is the finding.
- **Open/Closed.** A closed set of cases is extended by editing existing code because the variation point was never named. The signal is the edit, not the missing interface.
- **Feature envy.** A method that reaches into another object's data for most of its work belongs on the object that owns the data.
- **Inheritance used for reuse.** A subclass exists to borrow a method, not to be substitutable. The relationship is a composition or a parameter, not a type hierarchy.
- **Separable phases.** Work that reads, work that transforms and work that writes are interleaved so no single phase can be exercised alone.

### A2 Weak encapsulation

- **Invariants outside the object.** The object exposes fields and the caller keeps them consistent; the rule can be broken by any new caller.
- **Collection exposure.** A mutable collection is handed out by reference, so the owning object no longer controls its contents.
- **Command-query separation.** A getter mutates state, or a setter returns a result other than what it set, so a caller reading the code cannot tell an observation from a change.
- **Implicit dependencies.** A collaborator is created inside the logic or read from ambient state, so the unit cannot be constructed in a test without the ambient world.
- **Delegate chains.** A message travels through three objects that each add nothing; a caller must know the shape of the graph to reach one object.
- **Mutation through internals.** A write travels along a chain — `a.getB().getC().setX(...)` — so the object that owns the value never sees the change and cannot enforce its invariant.

### A3 Poor data types

- **Domain types.** A value with a fixed set of valid forms lives as a string, an int or a map entry, so every consumer re-validates it.
- **Typed expected failure.** An expected outcome — not found, rejected, retried — travels as null, a sentinel or an exception, so the caller cannot distinguish it from a defect.
- **Data clumps.** The same two or three values travel together through every signature and every call site: they are a type that has not been named.
- **Derived fields.** A value stored next to the value it derives from, and both allowed to change independently.
- **Identity against structural equality.** An entity compared by its contents, or a value compared by object identity: either way, two representations of the same thing are treated as different, or the reverse.
- **Shared mutable alias.** Two names hold the same mutable value, so a change through one is visible through the other and neither owner controls the state.
- **Typed boundaries.** An untyped value crosses a public boundary — an object, a raw map, an unvalidated payload — and the type is reasserted on the other side.

### A4 Flag/enum-modeled variants

- **Repeated dispatch.** The same `if` on the same discriminator appears at several sites; every new case edits all of them.
- **Type-check cascades.** A chain of type tests selects behavior, and a missing branch fails at run time instead of at compile time.
- **Mode fields.** An object carries a mode field that some methods ignore and others branch on, so an instance can be in a state its own methods do not expect.
- **Fields conditioned by a discriminator.** Some fields are meaningful only when the discriminator holds a given value and are null otherwise.

No thresholds and no priorities apply during planning: these signals open a decision, and DRY uses the rules of the body. Calibration answers "is this worth naming in the plan", not "should this diff be refactored".

## Design seams and enabling points

A design seam is a place where you can change what the code does by editing somewhere else — the concept Michael Feathers uses to make legacy behavior testable and swappable. Finding the place where the behavior lives is not enough: name the enabling point, the spot where the decision between one behavior and another is taken. A seam without an enabling point is a wish, because nobody can choose.

Two different acts hang off the same seam and they are not interchangeable: substituting behavior (the caller decides which implementation runs) and observing behavior (the test watches the same public surface the caller uses). The first makes a variation possible; the second makes a unit checkable. Plan the one the objective actually needs.

Source: Michael C. Feathers, Working Effectively with Legacy Code, for the design-seam concept.

## Deep modules and real variation

A deep module hides a lot of behavior behind a small, testable interface. That ratio — behavior against surface — is the design quantity to optimize, not the number of layers.

An adapter only proposes a seam: it is a hypothesis about variation until a second concrete implementation exists. Until then it is indirection with no user, and YAGNI keeps it out of the plan.

Apply the deletion test to every wrapper and pass-through you propose: delete the module in your head and see what is lost. When only indirection disappears and no complexity goes with it, the module earned nothing and the plan drops it.

Accept dependencies as a parameter: the unit receives its clock, its client, its repository from the caller instead of building them inside the logic. This is what lets a test seam exist at the boundary the system already has.

Source: Matt Pocock, codebase-design guidance, for deep modules, real seams, the deletion test and dependency acceptance.

## Output checklist

- Every design seam you name carries its enabling point.
- Every test seam you name is public: tests and callers reach it the same way.
- The two labels are never mixed — a design seam is not a public test surface, and a public surface is not an abstraction.
- No seam exists for an imagined variation: one hypothetical adapter is not a reason to plan one.
- Every abstraction you propose passes YAGNI, KISS and the deletion test before it enters the plan.
