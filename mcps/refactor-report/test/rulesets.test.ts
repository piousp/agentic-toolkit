import assert from "node:assert/strict";
import path from "node:path";
import { it } from "node:test";
import type { TestContext } from "node:test";

import { loadRuleset } from "../src/rulesets.ts";
import type { WorkspaceError } from "../src/workspace.ts";

// sha256sum rulesets/extract.yaml, computed with sha256sum from the published bytes
// and never printed by the implementation.
const EXTRACT_DIGEST = "72e6628994f02c10ddd1ea11d28f77c64cfb13e783e33a0cfb6ff7852a91dd9d";

// sha256sum test/fixtures/rulesets/unknown-kind.yaml, computed with sha256sum.
// sha256sum of the two broken variants, computed with sha256sum.
const MALFORMED_DIGEST = "07a1cae2e5c9d476a37c2aebcd280deed3aff0b7e163917f0bb2e056df37a33c";
const UNKNOWN_KEY_DIGEST = "3ecf83e77d3b62b87cde33341db041fd1a6b32d488736e2ba2245d865a7bd0b1";

// sha256sum test/fixtures/ruleset-traversal.yaml, computed with sha256sum: the
// escaped file exists and the reference carries its own prefix, so only the name
// guard can refuse it.
const TRAVERSAL_DIGEST = "c6f6854df8185c4b98f33ac4a2bf284b34b76ec0aa039842a4f0443fd0dc3f8b";

const UNKNOWN_KIND_DIGEST = "722f19c349ae3c18ab4ecc311f5945e59c57d790f514adc2162f219b36d1e585";

const FIXTURE_RULESET_ROOT = path.join(import.meta.dirname, "fixtures", "rulesets");

// R6: the ruleset directory is the one surface a caller replaces, so a case points
// RULESET_DIR at the bad variants and the loader reads those bytes instead of the
// published ones.
function useRulesetDir(t: TestContext): void {
  const previous = process.env.RULESET_DIR;
  process.env.RULESET_DIR = FIXTURE_RULESET_ROOT;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.RULESET_DIR;
    } else {
      process.env.RULESET_DIR = previous;
    }
  });
}

// R6: the ruleset travels inside the package and the caller names it by the prefix
// of its content digest, so a recipe naming bytes the server no longer ships stops
// resolving instead of running rules nobody published.
it("loads the two rules of the published ruleset through its content digest", async () => {
  const loaded = await loadRuleset(`extract.yaml#sha256:${EXTRACT_DIGEST.slice(0, 12)}`);

  assert.equal(loaded.ruleset_digest, `extract.yaml#sha256:${EXTRACT_DIGEST.slice(0, 12)}`);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.language, "typescript");
  assert.deepEqual(
    loaded.rules.map((rule) => [rule.id, rule.kind, rule.params]),
    [
      ["http-status-const", "extract-const", { name: "STATUS_OK" }],
      ["extract-helper", "extract-module", { target: "./ticket-parse" }],
    ],
  );
});

// R6: a prefix that no longer matches is refused with the digest the file really
// has, so the caller can repair the recipe without ever trusting the server.
it("refuses a digest prefix the published ruleset no longer has, and quotes the real one", async () => {
  await assert.rejects(
    () => loadRuleset(`extract.yaml#sha256:${"0".repeat(12)}`),
    (error: WorkspaceError) => {
      assert.equal(error.code, "RULESET_DIGEST_MISMATCH");
      assert.equal(error.message.includes(EXTRACT_DIGEST), true);
      return true;
    },
  );
});

// D6: a kind is code, not data, so a ruleset naming one this server does not
// implement is refused instead of loaded and silently skipped.
it("refuses a rule whose kind is outside the closed registry", async (t) => {
  useRulesetDir(t);

  await assert.rejects(
    () => loadRuleset(`unknown-kind.yaml#sha256:${UNKNOWN_KIND_DIGEST.slice(0, 12)}`),
    (error: WorkspaceError) => {
      assert.equal(error.code, "RULESET_INVALID");
      assert.equal(error.message.includes("extract-inline"), true);
      return true;
    },
  );
});

// R6: a ruleset name is published data, never a path. The pattern is checked before
// the file system is touched, so `..` is unrepresentable rather than filtered out.
it("refuses a ruleset name that climbs out of the ruleset directory", async (t) => {
  useRulesetDir(t);

  await assert.rejects(
    () => loadRuleset(`../ruleset-traversal.yaml#sha256:${TRAVERSAL_DIGEST.slice(0, 12)}`),
    (error: WorkspaceError) => {
      assert.equal(error.code, "RULESET_UNKNOWN");
      assert.equal(error.message.includes("../ruleset-traversal.yaml"), true);
      return true;
    },
  );
});

// R6: the schema is strict. A file that does not parse and a file carrying a key the
// server does not know are both refused, so a threshold can never travel in a
// ruleset and be quietly ignored.
it("refuses a ruleset that does not parse or that carries a key outside the schema", async (t) => {
  useRulesetDir(t);

  await assert.rejects(
    () => loadRuleset(`malformed.yaml#sha256:${MALFORMED_DIGEST.slice(0, 12)}`),
    { code: "RULESET_INVALID" },
  );
  await assert.rejects(
    () => loadRuleset(`unknown-key.yaml#sha256:${UNKNOWN_KEY_DIGEST.slice(0, 12)}`),
    (error: WorkspaceError) => {
      assert.equal(error.code, "RULESET_INVALID");
      assert.equal(error.message.includes("thresholds"), true);
      return true;
    },
  );
});
