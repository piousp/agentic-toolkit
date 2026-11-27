# Detection Cues: TypeScript

Grep-able or readable starting points for the A1 to A4 rows. Every cue names the row it feeds in
the last column; record it under that row's name, with that row's threshold and evidence. A grep
hit without the shape the row describes is not evidence: read the surrounding code first.

## A1: Missing or misplaced abstractions

| Cue | Grep or read | Feeds row |
|---|---|---|
| Duplicate pipeline shape | `grep -n "\.map(\|\.filter(\|\.reduce(\|\.flatMap("` inside each file the scope opened; compare chains across functions: same operator order and same callback body, only the element type, field or literal differs | Structural duplication (same algorithm, different type) |
| Duplicate function modulo its type parameter | Two functions, classes or interfaces identical except for the type parameter or element type; a single generic signature covers both | Structural duplication (same algorithm, different type) |
| Overload set with a duplicated body | Overload declarations whose one implementation repeats the same branch once per signature | Structural duplication (same algorithm, different type) |
| Duplicate async orchestration | Two functions with the same `await` / `try` / retry / `Promise.all` sequence, only the called API differs | Structural duplication (same algorithm, different type) |
| Re-implemented helper | A local arrow function, predicate or constant whose body matches one already exported from a file the scope opened only at the public-signature level (`grep -n "export function\|export const"` on that file) | Inline re-implementation of an existing helper |
| Duplicate predicate | The same domain condition in an `if`, a ternary or a `.filter` callback across files: same field names, same literals | Business-rule duplication |
| Second unrelated axis in a class in scope | Read the import block: an `import` from a folder unrelated to the module's domain; or `implements A, B` where `B`'s members share no field with `A`'s | SRP violation in a class in scope |
| Branch in an existing chain | `grep -n "case \|else if"` inside a chain in scope; count its branches and read whether one more variant would be another case here | OCP violation (dispatch modified, not extended) |
| Feature envy | Inside one method, count property reads and calls on one foreign object (`order.total`, `order.getTotal()`) against `this.` or the function's own parameters | Misplaced logic (feature envy) |
| Inheritance for reuse | `grep -n "extends "`; a subclass that overrides only to call `super.m()` and no-op, or that overrides nothing at all | Inheritance used for reuse, not variation |
| Mixed-phase function | One body that parses or validates raw input and then computes a result from those locals, with no named intermediate object between the halves | Mixed-phase function (no split phase) |

## A2: Weak encapsulation

| Cue | Grep or read | Feeds row |
|---|---|---|
| Field without `readonly` | `grep -n "readonly"` absent on a class field or an `interface`/`type` property the code writes after construction | Public mutable field |
| Mutable binding exported | `grep -n "export let\|export var"`, or an exported `const` object or array mutated from another module | Public mutable field |
| Instance field written from outside | A `constructor` assignment with no `#` or `private` modifier, and a write to that property in another file (`grep -rn "\.<field> ="`) | Public mutable field |
| Accessor returning the backing collection | A getter or method whose body is `return this.<field>` where the field is `T[]`, `Map`, `Set` or a plain object, the return type is not `readonly T[]` / `ReadonlyArray<T>`, and there is no copy (`[...x]`, `x.slice()`, `{...x}`) or `Object.freeze` | Mutable internals escaping |
| Invariant bypassed by a mutator | A constructor or factory that guards with an `if` or throws, while a setter, a spread `{...obj, field}`, an `Object.assign(obj, ...)` or a direct property write on the same field does not | Invariant bypassed by mutator |
| Repeated guard at the call sites | The same precondition (`if (x !== null)`, `if (x.length > 0)`) written immediately before calls to the same function, at several call sites; record each caller | Invariant enforced by callers (check-then-act) |
| Mutation through a chain | A chain into another object's internals ending in a write: `a.b.items.push(...)`, `a.b.c = x`, `.splice(`, `a.getB().getC().setX(...)`; record the depth | Mutation through reached-into internals |
| Query that also mutates | A function with a `return` that also writes `this.<field>` or a mutable object or array parameter. A local accumulator, `Array.prototype.pop` and a fluent setter returning `this` are the row's own exclusions | Query and mutator mixed (CQS violation) |
| Ambient read inside a body | `grep -n "Date\.now()\|new Date()\|Math\.random()\|globalThis\.\|process\.env\."` inside the function instead of a parameter | Hidden dependency on ambient state |
| Read-through chain | Chained reads with no trailing write (`a.b.c.d`, `a.b().c().d`), repeated at several sites; `grep -n "\.[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*\."`; record the depth | Read-through delegate chain |

## A3: Poor data types

| Cue | Grep or read | Feeds row |
|---|---|---|
| Primitive carrying a domain concept | A `string`/`number`/`boolean` parameter or field meaning an id, code, currency, email or status across the signatures in scope, or the same format checked in several places (`grep -n "\.test(\|RegExp("`); a `type Email = string` alias brands nothing | Primitive obsession |
| Literal comparison as a branch | `grep -n "=== '\|=== \""` comparing one field against literals, or an `as const` array or a literal union declared as the allowed values of one field | Stringly-typed state |
| Producer returning `null` on not-found | A `T \| null` or optional return on the expected-absence path, with callers narrowing through `?.`, `??` or `!` (`grep -n "?\.\|??\|!\.\|!== null"`) | null as domain absence |
| Throw for an expected outcome | `throw new Error(...)` or a thrown subclass for an expected domain failure, with a nearby `catch` that branches on `err.message`, `err.code` or `instanceof` instead of rethrowing | Exceptions as control flow |
| Inline object shape in several signatures | The same `{ a: string; b: number; c: Date }` parameter shape, same names in the same order, in several signatures with no named type (`grep -n "{ [a-z][A-Za-z0-9]*: "`) | Data clump |
| Field computed once from sibling fields | A property assigned in the constructor or an initializer from other fields the object already holds, where an accessor could compute it at the point of use (`grep -n "this\.[a-z][A-Za-z0-9]* = "` in the constructor) | Redundant derived field |
| Aliased value object | An object with value semantics (`{ amount, currency }`, `{ start, end }`, a `Date`) assigned to a second owner without a copy and then mutated through one of them | Shared mutable reference used as a value |
| `any` or `unknown` at a boundary | `grep -n ": any\|<any>\|as any\|: unknown"` on a signature, field or generic argument that crosses a module or I/O boundary; on the payload side, `JSON.parse`, `res.json()` or `req.body` consumed field by field with inline guards instead of one parse into a domain value | Untyped boundary value |

## A4: Flag/enum-modeled variants

| Cue | Grep or read | Feeds row |
|---|---|---|
| Second dispatch over one discriminator | `grep -n "switch (\|case '"` over the same field, `if (x.kind === '...')` chains, or a lookup map keyed by the same field (`Record<Kind, Fn>`); when the discriminator is an `enum` (`grep -n "enum "`), each `switch` over it | Duplicated dispatch over the same discriminator |
| Dispatch with no exhausted branch | `switch (x.kind)` over a union with no `never` / `assertNever` default, or an `if`/`else if` narrowing chain over the union | Type-check cascade on a union |
| Union separated by type tests | `grep -n "typeof \|instanceof \|Array.isArray\| in obj"`: a `type X = A \| B` narrowed with `'field' in obj`, `typeof`, `Array.isArray` or truthiness instead of one shared `kind` literal | Type-check cascade on a union |
| Mode read at the top of several methods | The same `this.<mode>` or `x.status` field in a guard inside several methods of one class (`grep -n "this\.\(status\|mode\|state\)"`) | Mode field checked across methods |
| Optional members that belong to one variant | An `interface` or `type` with optional members (`grep -n "?:"` inside the declaration) whose presence depends on one discriminant field, guarded on it or commented "only set when ..." | Nullable members as variants |
