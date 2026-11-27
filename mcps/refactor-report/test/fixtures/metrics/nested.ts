export function container(limit: number): number {
  function nested(value: number): number {
    if (value > 0) {
      return 1;
    }
    if (value < 0) {
      return -1;
    }
    return 0;
  }
  return nested(limit);
}
