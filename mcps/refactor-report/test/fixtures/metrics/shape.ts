export const DEFAULT_TICKET = 0;

export function pickTicket(id: number): number {
  if (id > 0) {
    return id;
  }
  return 0;
}

export function describeTicket(id: number): string {
  return `ticket ${id}`;
}
