import { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";

import { measureRequestSchema, previewRequestSchema } from "./contracts.ts";
import type { MeasureRequest, PreviewRequest } from "./contracts.ts";
import { errorResult } from "./errors.ts";
import type { ToolError } from "./errors.ts";
import type { Git } from "./git.ts";
import { runMeasure } from "./measure.ts";
import { runPreview } from "./preview.ts";
import { WorkspaceError } from "./workspace.ts";
import type { Workspace } from "./workspace.ts";

// The identity the wire reports on initialize. The manifest declares the same
// package name; the version is the package's own and changes with it.
export const SERVER_NAME = "refactor-report";
export const SERVER_VERSION = "0.0.0";

export const MEASURE_TOOL = "measure";
export const PREVIEW_TOOL = "preview";

// D2: the root and the git adapter are resolved once per entry and injected, so a
// connection never re-resolves the workspace and a case can hand in a double.
export type ServerDeps = {
  readonly workspace: Workspace;
  readonly git: Git;
};

// What a tool answers: the JSON document a verb reports, or the error body with
// its named code. Both travel as text, so a client reads one shape either way.
// A request the schema refuses is PARAM_INVALID: it never reached a resolver, so
// none of the scope codes applies to it.
function paramInvalid(detail: string): CallToolResult {
  return errorResult({ code: "PARAM_INVALID", detail });
}

// The issues as one line: where the request failed and why, in the order zod
// reports them, so the detail names a field the caller can correct.
function describeIssues(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): string {
  return issues
    .map((issue) => {
      const at = issue.path.map((part) => String(part)).join(".");
      return at === "" ? issue.message : `${at}: ${issue.message}`;
    })
    .join("; ");
}

function toolErrorOf(error: WorkspaceError): ToolError {
  return error.paths === undefined
    ? { code: error.code, detail: error.message }
    : { code: error.code, detail: error.message, paths: error.paths };
}

// R1/R4: `measure` answers through the service, and a failure the service named
// keeps its code instead of collapsing into a bare error.
async function answerMeasure(args: unknown, deps: ServerDeps): Promise<CallToolResult> {
  const parsed = measureRequestSchema.safeParse(args);
  if (!parsed.success) {
    return paramInvalid(`the request does not match the measure schema: ${describeIssues(parsed.error.issues)}`);
  }
  try {
    // D3: the schema deliberately leaves the scope permissive, so the resolvers
    // own which mode a request carries; this is where that document becomes the
    // typed request the service reads.
    const request = parsed.data as MeasureRequest;
    const response = await runMeasure(request, deps);
    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return errorResult(toolErrorOf(error));
    }
    throw error;
  }
}

// R5: `preview` answers through its service, which reports the change a recipe would
// make and writes none of it: the tree is the same after the call as before it.
async function answerPreview(args: unknown, deps: ServerDeps): Promise<CallToolResult> {
  const parsed = previewRequestSchema.safeParse(args);
  if (!parsed.success) {
    return paramInvalid(`the request does not match the preview schema: ${describeIssues(parsed.error.issues)}`);
  }
  try {
    const request = parsed.data as PreviewRequest;
    const response = await runPreview(request, { workspace: deps.workspace });
    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return errorResult(toolErrorOf(error));
    }
    throw error;
  }
}

// R1/R10: one registry per connection. The stdio entry owns the lifetime of the
// process, so a server is built per connection and carries no state across them.
export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    MEASURE_TOOL,
    {
      description:
        "Report per-file TypeScript metrics over a scope of the work tree, each number with the command that reproduces it.",
      inputSchema: measureRequestSchema,
    },
    (args: unknown) => answerMeasure(args, deps),
  );

  server.registerTool(
    PREVIEW_TOOL,
    {
      description:
        "Report the edits a published ruleset recipe would make, with applied false and nothing written to disk.",
      inputSchema: previewRequestSchema,
    },
    (args: unknown) => answerPreview(args, deps),
  );

  return server;
}
