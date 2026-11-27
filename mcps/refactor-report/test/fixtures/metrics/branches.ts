// Worked examples for the S-unit-metrics seam: one exported function per
// decision-point family, so a test reads the complexity of exactly one unit.

export type Box = {
  readonly nested?: { readonly label?: string } | null;
  readonly items?: readonly number[];
  readonly render?: (input: number) => string;
};

export function straightLine(value: number): number {
  const doubled = value * 2;
  return doubled + 1;
}

export function ifAndElseIf(value: number): number {
  if (value > 10) {
    return 3;
  } else if (value > 5) {
    return 2;
  } else {
    return 1;
  }
}

export function switchCases(value: string): number {
  switch (value) {
    case "a":
      return 1;
    case "b":
      return 2;
    case "c":
      return 3;
    default:
      return 0;
  }
}

export function guardedCatch(text: string): number {
  try {
    return Number.parseInt(text, 10);
  } catch {
    return 0;
  }
}

export function logicalOperators(left: boolean, right: boolean, fallback: string | null): unknown {
  return (left && right) || (fallback ?? "none");
}

export function ternaryPick(flag: boolean): number {
  return flag ? 1 : 0;
}

export function optionalChain(box: Box): unknown {
  return [box.nested?.label, box.items?.[0], box.render?.(1)];
}

export function everyLoop(rows: readonly number[]): number {
  let total = 0;
  for (const row of rows) {
    total += row;
  }
  for (let index = 0; index < rows.length; index += 1) {
    total += index;
  }
  let cursor = 2;
  while (cursor > 0) {
    cursor -= 1;
  }
  do {
    cursor += 1;
  } while (cursor < 2);
  for (const key in rows) {
    total += key.length;
  }
  return total;
}
