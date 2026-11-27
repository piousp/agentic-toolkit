import assert from "node:assert/strict";
import { it } from "node:test";

import { ERROR_CODES, errorResult } from "../src/errors.ts";

it("names exactly the closed error vocabulary of the plan", () => {
  assert.deepEqual([...ERROR_CODES].sort(), [
    "BASE_UNRESOLVED",
    "EDIT_CONFLICT",
    "FILES_OVER_LIMIT",
    "FILE_UNREADABLE",
    "LANGUAGE_UNSUPPORTED",
    "NOT_A_GIT_REPOSITORY",
    "PARAM_INVALID",
    "PATH_NOT_IN_SCOPE",
    "PATH_OUTSIDE_ROOT",
    "PREVIEW_OVER_LIMIT",
    "RULESET_DIGEST_MISMATCH",
    "RULESET_INVALID",
    "RULESET_UNKNOWN",
    "RULE_UNKNOWN",
    "SCOPE_DOUBLE",
    "SCOPE_INVALID",
    "SCOPE_MISSING",
    "SYMBOL_NOT_FOUND",
    "TARGET_EXISTS",
  ]);
});

it("reports an error as a JSON text body flagged isError, with no structured content", () => {
  const result = errorResult({ code: "SCOPE_MISSING", detail: "measure needs exactly one scope mode" });

  assert.equal(result.isError, true);
  assert.equal(
    result.content[0]?.text,
    '{"error":{"code":"SCOPE_MISSING","detail":"measure needs exactly one scope mode"}}',
  );
  assert.equal("structuredContent" in result, false);
});

it("lists the candidate paths in the error body when the code carries them", () => {
  const result = errorResult({
    code: "SYMBOL_NOT_FOUND",
    detail: "src/ticket.ts has no unit named parseTicket",
    paths: ["src/ticket.ts:12", "src/ticket.ts:30"],
  });

  assert.equal(
    result.content[0]?.text,
    '{"error":{"code":"SYMBOL_NOT_FOUND","detail":"src/ticket.ts has no unit named parseTicket","paths":["src/ticket.ts:12","src/ticket.ts:30"]}}',
  );
});
