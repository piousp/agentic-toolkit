import { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import { measureRequestSchema } from "./contracts.ts";
import type { MeasureRequest } from "./contracts.ts";
import { errorResult } from "./errors.ts";
import type { ToolError } from "./errors.ts";
import type { Git } from "./git.ts";
import { runMeasure } from "./measure.ts";
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

// R5: the recipe grammar the contract fixes for `preview`. The schema belongs to
// the verb and travels to `contracts.ts` with the service it describes.
const recipeReference = /^[a-z0-9][a-z0-9-]*\.yaml#sha256:[0-9a-f]{12}$/;

const previewRequestSchema = z.strictObject({
  recipe: z.strictObject({
    ruleset: z.string().regex(recipeReference),
    rules: z.array(z.string()).optional(),
  }),
  paths: z.array(z.string()),
});

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

// R5: `preview` keeps its place in the listing with the shape the contract fixes.
// Its service is not part of this branch, so the verb answers the code a caller
// receives when the request cannot be served rather than a report it invented.
const PREVIEW_UNAVAILABLE =
  "the preview service is not available on this branch; only measure answers a report";

function answerPreview(args: unknown): CallToolResult {
  const parsed = previewRequestSchema.safeParse(args);
  if (!parsed.success) {
    return paramInvalid(`the request does not match the preview schema: ${describeIssues(parsed.error.issues)}`);
  }
  return paramInvalid(PREVIEW_UNAVAILABLE);
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
    (args: unknown) => answerPreview(args),
  );

  return server;
}
