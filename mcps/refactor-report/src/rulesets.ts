import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { WorkspaceError } from "./workspace.ts";

// R6: a ruleset is named `<file>.yaml#sha256:<12>` and the twelve characters are the
// prefix of the digest of the bytes the package ships. The name is the only part of
// the reference the file system ever sees.
export const RULESET_DIGEST_SEPARATOR = "#sha256:";
export const RULESET_DIGEST_PREFIX_LENGTH = 12;

// R6: a ruleset name is published data, never a path. The pattern is the whole
// guard: a separator, a `..` or an absolute path cannot be spelled as a name, so
// traversal is unrepresentable instead of being filtered out after the fact.
export const RULESET_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*\.yaml$/;

// D6: a kind is code, not data. The registry is closed and a ruleset is only
// parameterised by the YAML; adding a kind is a change to this package.
export const RULESET_KINDS = ["extract-const", "extract-module"] as const;

export type RulesetKind = (typeof RULESET_KINDS)[number];

export type RulesetRule = {
  readonly id: string;
  readonly kind: RulesetKind;
  readonly description: string;
  readonly match: Readonly<Record<string, unknown>>;
  readonly params: Readonly<Record<string, unknown>>;
};

export type Ruleset = {
  readonly name: string;
  readonly ruleset_digest: string;
  readonly version: number;
  readonly language: string;
  readonly rules: readonly RulesetRule[];
};

// R6: the published rulesets sit beside the sources; the built entry resolves the
// same directory from dist. RULESET_DIR replaces it, which is how a caller audits a
// ruleset it has not installed.
export function rulesetDir(): string {
  const configured = process.env.RULESET_DIR;
  if (configured !== undefined && configured !== "") {
    return path.resolve(configured);
  }
  return path.resolve(import.meta.dirname, "..", "rulesets");
}

// The digest is the one `sha256sum rulesets/<file>` prints, so a recipe's prefix is
// checkable outside this server.
function contentDigest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function assertPublishedName(name: string): void {
  if (!RULESET_NAME_PATTERN.test(name)) {
    throw new WorkspaceError(
      "RULESET_UNKNOWN",
      `${name} is not a published ruleset name: a name matches ${RULESET_NAME_PATTERN.source} and is resolved inside the ruleset directory`,
    );
  }
}

// A name that passes the pattern but is not there is unpublished, not unreadable:
// the caller asked for bytes this package does not ship.
function readRulesetText(dir: string, name: string): Promise<string> {
  return readFile(path.join(dir, name), "utf8").catch(() => {
    throw new WorkspaceError(
      "RULESET_UNKNOWN",
      `${name} is not published in the ruleset directory`,
    );
  });
}

type Reference = { readonly name: string; readonly prefix: string };

function referenceOf(reference: string): Reference {
  const at = reference.indexOf(RULESET_DIGEST_SEPARATOR);
  return at < 0
    ? { name: reference, prefix: "" }
    : {
        name: reference.slice(0, at),
        prefix: reference.slice(at + RULESET_DIGEST_SEPARATOR.length),
      };
}

// R6: the comparison is against the bytes read, so a ruleset edited after the recipe
// was written stops resolving. The detail carries the whole digest: the caller
// repairs its recipe and never has to ask this server what the file now holds.
function assertDigestMatches(name: string, prefix: string, digest: string): void {
  const expected = digest.slice(0, RULESET_DIGEST_PREFIX_LENGTH);
  if (prefix !== expected) {
    throw new WorkspaceError(
      "RULESET_DIGEST_MISMATCH",
      `${name} is sha256:${digest}; the recipe names sha256:${prefix}`,
    );
  }
}

function kindOf(raw: unknown, ruleId: string, name: string): RulesetKind {
  const kind = typeof raw === "string" ? RULESET_KINDS.find((candidate) => candidate === raw) : undefined;
  if (kind === undefined) {
    throw new WorkspaceError(
      "RULESET_INVALID",
      `${name}: rule ${ruleId} names kind ${String(raw)}; the registry holds ${RULESET_KINDS.join(", ")} and an unknown kind is never skipped`,
    );
  }
  return kind;
}

const RULESET_KEYS: ReadonlySet<string> = new Set(["version", "language", "rules"]);
const RULE_KEYS: ReadonlySet<string> = new Set(["id", "kind", "description", "match", "params"]);

function mappingOf(raw: unknown, name: string, where: string): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new WorkspaceError("RULESET_INVALID", `${name}: ${where} is not a mapping`);
  }
  return raw as Record<string, unknown>;
}

// R6: strict on purpose. A key this server does not know is refused instead of
// ignored, so a ruleset can never carry a threshold the server would silently drop.
function strictMappingOf(
  raw: unknown,
  name: string,
  where: string,
  allowed: ReadonlySet<string>,
): Record<string, unknown> {
  const record = mappingOf(raw, name, where);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new WorkspaceError(
        "RULESET_INVALID",
        `${name}: ${where} carries the key ${key}; the schema holds ${[...allowed].join(", ")} and an unknown key is never ignored`,
      );
    }
  }
  return record;
}

function ruleOf(raw: unknown, name: string): RulesetRule {
  const rule = strictMappingOf(raw, name, "a rule", RULE_KEYS);
  const id = rule.id;
  // A rule nothing can name is a rule no recipe can select: refused as unknown
  // rather than carried with a placeholder id.
  if (typeof id !== "string" || id === "") {
    throw new WorkspaceError(
      "RULE_UNKNOWN",
      `${name}: a rule carries no id, and a rule without an id cannot be named by a recipe`,
    );
  }
  return {
    id,
    kind: kindOf(rule.kind, id, name),
    description: stringOf(rule.description, name, `rule ${id} description`),
    match: mappingOf(rule.match, name, `rule ${id} match`),
    params: mappingOf(rule.params, name, `rule ${id} params`),
  };
}

function stringOf(raw: unknown, name: string, where: string): string {
  if (typeof raw !== "string" || raw === "") {
    throw new WorkspaceError("RULESET_INVALID", `${name}: ${where} is not a non-empty string`);
  }
  return raw;
}

// R6/R7: the document is read once, strictly, and the two fields that pin which
// ruleset this server can run are checked before any rule: version 1 and typescript
// are the only pair v1 reads.
type RulesetBody = {
  readonly version: number;
  readonly language: string;
  readonly rules: readonly RulesetRule[];
};

function rulesetOf(name: string, text: string): RulesetBody {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    throw new WorkspaceError(
      "RULESET_INVALID",
      `${name} does not parse: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const ruleset = strictMappingOf(parsed, name, "the ruleset", RULESET_KEYS);
  if (ruleset.version !== 1) {
    throw new WorkspaceError(
      "RULESET_INVALID",
      `${name}: version ${String(ruleset.version)} is not the version this server reads`,
    );
  }
  if (ruleset.language !== "typescript") {
    throw new WorkspaceError(
      "RULESET_INVALID",
      `${name}: language ${String(ruleset.language)}; v1 reads typescript only`,
    );
  }
  const rules = ruleset.rules;
  if (!Array.isArray(rules)) {
    throw new WorkspaceError("RULESET_INVALID", `${name}: rules is not a sequence`);
  }
  return { version: 1, language: "typescript", rules: rules.map((rule) => ruleOf(rule, name)) };
}

export async function loadRuleset(reference: string): Promise<Ruleset> {
  const { name, prefix } = referenceOf(reference);
  assertPublishedName(name);
  const text = await readRulesetText(rulesetDir(), name);
  const digest = contentDigest(text);
  assertDigestMatches(name, prefix, digest);
  const { version, language, rules } = rulesetOf(name, text);

  return {
    name,
    ruleset_digest: `${name}${RULESET_DIGEST_SEPARATOR}${digest.slice(0, RULESET_DIGEST_PREFIX_LENGTH)}`,
    version,
    language,
    rules,
  };
}
