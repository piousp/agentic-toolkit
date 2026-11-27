import { createHash } from "node:crypto";

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "string") {
    return normalizeNewlines(value);
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}
