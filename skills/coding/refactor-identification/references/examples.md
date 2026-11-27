# Worked Examples

One resolved example per category, a second one for the A3 "Redundant derived field" row, one
candidate filtered by the gate, and one candidate filtered by N9. Each example pairs the
before-snippet as it appears in a branch's diff with the exact block the run emits. Priorities
are the ones the cascade of the run's mode assigns; every example but the last is diff mode, and
the last one runs in area mode over a declared module.

## A1: Structural duplication (same algorithm, different type)

The branch adds `computeInvoiceTotal` to `src/billing/invoice-service.ts`;
`computeRefundTotal`, identical except for its line type, already lives in the same file and the
branch does not touch it.

```ts
// src/billing/invoice-service.ts:41 (touched by this branch)
export function computeInvoiceTotal(lines: InvoiceLine[]): number {
  let total = 0;
  for (const line of lines) total += line.amount * line.quantity;
  return total;
}

// src/billing/invoice-service.ts:58 (pre-existing, untouched)
export function computeRefundTotal(lines: RefundLine[]): number {
  let total = 0;
  for (const line of lines) total += line.amount * line.quantity;
  return total;
}
```

```markdown
#### [RF-1] A1 Structural duplication (same algorithm, different type): P1
- Evidence: `src/billing/invoice-service.ts:41`, `src/billing/invoice-service.ts:58` (2 occurrences, identical modulo type: `InvoiceLine` vs `RefundLine`; count: `grep -rnF "line.amount * line.quantity" --include='*.ts' src/` -> 2 hits)
- Anchored in scope: `src/billing/invoice-service.ts:41` (added hunk)
- Gate: passes; closest row N2 doesn't apply because both copies apply the same line-total rule, `amount * quantity` over the same two fields, so a change to that rule changes both
- Refactor direction: one line-total function generic over a line type carrying `amount` and `quantity` (direction only, never the how)
```

The copy the branch adds is itself a root-cause line, which is what makes this P1 rather than P2.

## A2: Mutable internals escaping

The branch adds a class whose accessor hands out the live backing array.

```ts
// src/orders/order-tracker.ts:12 (touched by this branch)
export class OrderTracker {
  pendingOrders: Order[] = [];

  get pending(): Order[] {
    return this.pendingOrders;
  }
}
```

```markdown
#### [RF-1] A2 Mutable internals escaping: P1
- Evidence: `src/orders/order-tracker.ts:16` (accessor), `src/orders/order-tracker.ts:13` (field) (escapes: `Order[]`, returned live with no copy); also: A2 Public mutable field
- Anchored in scope: `src/orders/order-tracker.ts:12-18` (added hunk)
- Gate: passes; closest row N3 doesn't apply because returning a `readonly Order[]` snapshot is no harder to read than returning the live array
- Refactor direction: hand out a `readonly Order[]` copy (`ReadonlyArray<Order>`) and keep the backing array private (direction only, never the how)
```

The accessor and the field are two rows over one root-cause declaration, and the branch's class
pushes into `pendingOrders` after construction, so step 8b merges them into one candidate and the
Evidence line names the second row as "also:".

## A3: null as domain absence

The branch adds a second call site that guards the same producer's return value.

```ts
// src/customers/customer-lookup.ts:77 (pre-existing producer, untouched)
findCustomerById(id: CustomerId): Customer | null {
  return this.repository.find(id) ?? null;
}

// src/customers/customer-lookup.ts:104 (touched by this branch; first guard)
const customer = lookup.findCustomerById(id);
if (customer !== null) greet(customer);

// src/orders/order-service.ts:33 (touched by this branch; second guard)
const found = customerLookup.findCustomerById(order.customerId);
const label = found === null ? 'unknown' : found.name;
```

```markdown
#### [RF-1] A3 null as domain absence: P2
- Evidence: `src/customers/customer-lookup.ts:77` (producer), `src/customers/customer-lookup.ts:104`, `src/orders/order-service.ts:33` (2 guards on the same producer's result; count: `grep -rnF ".findCustomerById(" --include='*.ts' src/` -> 2 hits)
- Anchored in scope: `src/customers/customer-lookup.ts:104`, `src/orders/order-service.ts:33` (both added hunks)
- Gate: passes; closest row N6 doesn't apply because the absence is guarded at 2 call sites, not one
- Refactor direction: make the absence a case of the return type instead of `null` (direction only, never the how)
```

Mixed evidence: the root-cause line is the pre-existing producer, and the branch only adds
occurrences that reference it, so the priority follows the root cause and stays P2.

## A4: Duplicated dispatch over the same discriminator

The branch adds a second `switch` over the status field that already had one dispatch site.

```ts
// src/payments/payment.ts:3 (pre-existing, untouched: the discriminator's declaration)
export const STATUS = { pending: 0, settled: 1, failed: 2 } as const;
export type Payment = { amount: Cents; status: number }; // one of the STATUS values

// src/payments/payment-view.ts:22 (pre-existing dispatch, untouched)
switch (payment.status) {
  case STATUS.pending: return 'Pending';
  case STATUS.settled: return 'Settled';
  case STATUS.failed: return 'Failed';
}

// src/payments/payment-notifier.ts:45 (touched by this branch; second dispatch, same discriminator)
switch (payment.status) {
  case STATUS.pending: sendPendingEmail(payment); break;
  case STATUS.settled: sendReceiptEmail(payment); break;
  case STATUS.failed: sendFailureEmail(payment); break;
}
```

`src/payments/payment-view.ts` entered the run only through the occurrence count: the branch
changes no symbol that file defines or uses, so the file sits outside the 1-hop radius. Replacing
the numeric status edits that file, so the fix exceeds the 1-hop context and lands in P3. The
root-cause line, the status field's declaration, pre-exists, so the branch-added dispatch site
alone could never make it P1.

```markdown
#### [RF-1] A4 Duplicated dispatch over the same discriminator: P3
- Evidence: `src/payments/payment-view.ts:22`, `src/payments/payment-notifier.ts:45` (2 dispatch sites over the same `status` discriminator, 3 variants each; count: `grep -rn "switch (payment\.status)" --include='*.ts' src/` -> 2 hits)
- Anchored in scope: `src/payments/payment-notifier.ts:45` (added hunk)
- Gate: passes; closest row N5 doesn't apply because the discriminator carries 3 variants, not 2 simple ones
- Refactor direction: replace the numeric status code with a closed set of variants that carry their own payload and dispatch over it exhaustively (direction only, never the how)
```

## Filtered by the gate: speculative Strategy

The branch adds a single discount calculation and no second implementation.

```ts
// src/pricing/discount-calculator.ts:9 (touched by this branch)
export function applyDiscount(order: Order): number {
  if (order.total > 100) return order.total * 0.9;
  return order.total;
}
```

This reads as an A1 OCP violation (dispatch modified, not extended): one more discount rule would
arrive as another branch of this chain. The gate stops it at N1 before the question of size comes
up, because only one rule exists and nothing in the scope shows a concrete second one.

```markdown
### Filtered out
- A1 OCP violation (dispatch modified, not extended) at
  `src/pricing/discount-calculator.ts:9-13`, filtered by N1 (only one discount rule exists and this
  scope shows no second implementation)
```

## Filtered by N9: duplicate whose other copy lives in another repository

The branch adds `qualifiesForFreeShipping` to `src/shipping/shipping-calculator.ts`, encoding an
eligibility predicate; the caller's prompt says the same predicate is also used by the separate
pricing-engine repository.

```ts
// src/shipping/shipping-calculator.ts:2 (touched by this branch)
export function qualifiesForFreeShipping(customer: Customer, order: Order): boolean {
  return customer.tier === 'premium' && order.total > 500;
}
```

This repository holds one local occurrence. The caller points to a copy outside it, so step 8
carries the candidate to the gate instead of filtering it as below threshold. The pricing-engine
repository is not checked out here. A cross-repository helper is P3 at best, so N9 sends the
candidate to one Filtered out line naming the repository: never a Finding, never silently
dropped.

```markdown
### Filtered out
- A1 Business-rule duplication at `src/shipping/shipping-calculator.ts:2`, filtered by N9 (the other copy, if any, lives in the pricing-engine repository; not checkable from this scope, and a cross-repository fix is P3 at best)
```

## A3: Redundant derived field

The branch adds a `fullName` field to `src/customers/customer.ts`, set once in the constructor
from two fields the same class already holds.

```ts
// src/customers/customer.ts:9 (touched by this branch: lines 12 and 17 are added)
export class Customer {
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;

  constructor(firstName: string, lastName: string) {
    this.firstName = firstName;
    this.lastName = lastName;
    this.fullName = `${firstName} ${lastName}`;
  }
}
```

```markdown
#### [RF-1] A3 Redundant derived field: P1
- Evidence: `src/customers/customer.ts:12` (`fullName` duplicates `firstName` + `lastName`, both held by the same object)
- Anchored in scope: `src/customers/customer.ts:12`, `src/customers/customer.ts:17` (both added hunks)
- Gate: passes; closest row N8 doesn't apply because removing the field deletes a second source of truth rather than renaming or reformatting anything
- Refactor direction: derive `fullName` as an accessor at the point of use instead of storing it (direction only, never the how)
```

## Area mode: a declared module, no diff

The caller declares `area: { granularity: module, targets: ["src/pricing"] }`. There is no branch
and no base ref: the run freezes the three files under that module, takes their sha256 manifest,
and reads nothing outside it except the public signatures one hop away.

```ts
// src/pricing/quote.ts:8
export class Quote {
  readonly subtotal: number;
  readonly taxRate: number;
  total: number;

  constructor(subtotal: number, taxRate: number) {
    this.subtotal = subtotal;
    this.taxRate = taxRate;
    this.total = subtotal * (1 + taxRate);
  }
}
```

```ts
// src/pricing/quote-store.ts:5
export class QuoteStore {
  private readonly quotes: Quote[] = [];
  private readonly audit: AuditLog;

  constructor(audit: AuditLog) {
    this.audit = audit;
  }

  add(quote: Quote): void {
    this.quotes.push(quote);
    this.audit.append('quote.added');
  }

  all(): readonly Quote[] {
    return this.quotes;
  }
}
```

`Quote.total` is a field the type could read off the two fields it already holds, so it is A3
"Redundant derived field" and its fix fits the file the run already opened: P1. `QuoteStore` mixes
bookkeeping with an unrelated audit collaborator, which is A1 "SRP violation in a class in scope",
and moving the audit call out needs a file this run has not opened: P2. Different classes decide
before activity and debt are consulted, so the order of the two findings is the class order.

```markdown
## Refactor Candidates: src/pricing

### Scope
- Area: module src/pricing | Targets: 3 | Manifest: 9f2c1a0d4b7e6c58a3f19d02be45c7713d8a6f4e0b1c9d27a5e83f6b4c0d19a2
- Files in scope: 3 | Context files read (1-hop): 2
- Coverage: complete
- Out of language scope: (none)

### Findings

#### [RF-1] A3 Redundant derived field: P1
- Evidence: `src/pricing/quote.ts:11` (`total` is `subtotal * (1 + taxRate)`, both fields already on the same object)
- Anchored in scope: `src/pricing/quote.ts:11` (line inside the selector)
- Gate: passes; closest row N7 doesn't apply because the value crosses the constructor boundary and is read by other modules
- Refactor direction: derive the total at the point of use instead of storing it (direction only, never the how)

#### [RF-2] A1 SRP violation in a class in scope: P2
- Evidence: `src/pricing/quote-store.ts:5`, `src/pricing/quote-store.ts:15` (bookkeeping and an audit trail are two axes of change in one class)
- Anchored in scope: `src/pricing/quote-store.ts:15` (line inside the selector)
- Gate: passes; closest row N3 doesn't apply because the extraction is one collaborator call, not a new indirection over the whole class
- Refactor direction: let the caller record the audit event, so the store keeps only its collection (direction only, never the how)

### Unresolved (needs out-of-scope evidence)
- (none)

### Filtered out
- (none)

### Summary: 2 candidates (1 P1, 1 P2, 0 P3), 0 unresolved, 0 filtered out
```

The digest is the sha256 of the frozen manifest, printed as the run read it; it changes whenever a
file inside the scope changes, which is how a second round knows it is looking at a different
scope. Activity and debt are recorded in the run's receipt, not in the report.
