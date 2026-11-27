export const ERROR_CODES = [
  "PARAM_INVALID",
  "SCOPE_MISSING",
  "SCOPE_DOUBLE",
  "SCOPE_INVALID",
  "PATH_OUTSIDE_ROOT",
  "PATH_NOT_IN_SCOPE",
  "SYMBOL_NOT_FOUND",
  "LANGUAGE_UNSUPPORTED",
  "BASE_UNRESOLVED",
  "NOT_A_GIT_REPOSITORY",
  "FILE_UNREADABLE",
  "FILES_OVER_LIMIT",
  "RULESET_UNKNOWN",
  "RULESET_DIGEST_MISMATCH",
  "RULESET_INVALID",
  "RULE_UNKNOWN",
  "TARGET_EXISTS",
  "EDIT_CONFLICT",
  "PREVIEW_OVER_LIMIT",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ToolError = { code: ErrorCode; detail: string; paths?: string[] };

export type TextContent = { type: "text"; text: string };

export type ToolErrorResult = { isError: true; content: TextContent[] };

export function errorResult(error: ToolError): ToolErrorResult {
  const body =
    error.paths === undefined
      ? { error: { code: error.code, detail: error.detail } }
      : { error: { code: error.code, detail: error.detail, paths: error.paths } };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(body) }] };
}
