import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { it } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

// The package root is derived from this file, so no machine path is written down
// and the spawn reaches the entry the build emits in the same checkout.
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = path.join(PACKAGE_ROOT, "dist", "index.js");

// The name the wire identifies is the one the manifest declares, read here so the
// expected value does not come from the code under test.
const DECLARED_PACKAGE_NAME = (
  JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as { name: string }
).name;

// A version the protocol fixes and the server negotiates, not a value of this package.
const PROTOCOL_VERSION = "2025-06-18";

type JsonRpcMessage = {
  readonly jsonrpc: string;
  readonly id?: number;
  readonly result?: unknown;
  readonly error?: unknown;
};

type Peer = {
  /** Every non-empty line the entry wrote to stdout, in order. */
  stdoutLines(): readonly string[];
  /** The entry's stderr, so a failure message can say why it died. */
  stderr(): string;
  request(id: number, method: string, params?: unknown): Promise<JsonRpcMessage | null>;
  notify(method: string, params?: unknown): void;
};

function parseLine(line: string): JsonRpcMessage | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed === null || typeof parsed !== "object") {
      return null;
    }
    const message = parsed as { jsonrpc?: unknown };
    return message.jsonrpc === "2.0" ? (parsed as JsonRpcMessage) : null;
  } catch {
    return null;
  }
}

// The stdio binding frames one JSON-RPC message per line. The peer keeps the raw
// text as well, because a line that is not protocol output is exactly the defect
// this seam has to catch.
function openPeer(child: ChildProcessWithoutNullStreams): Peer {
  const stdoutLines: string[] = [];
  const waiting = new Map<number, (message: JsonRpcMessage | null) => void>();
  let stderrText = "";
  let open = true;

  child.stderr.on("data", (chunk: Buffer) => {
    stderrText += chunk.toString("utf8");
  });

  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line: string) => {
    if (line.trim() === "") {
      return;
    }
    stdoutLines.push(line);
    const message = parseLine(line);
    if (message === null || message.id === undefined) {
      return;
    }
    const resolve = waiting.get(message.id);
    if (resolve !== undefined) {
      waiting.delete(message.id);
      resolve(message);
    }
  });

  // A closed stream answers every outstanding request with nothing, so a wait
  // ends in an assertion the test owns instead of a hang.
  lines.on("close", () => {
    open = false;
    for (const [id, resolve] of waiting) {
      waiting.delete(id);
      resolve(null);
    }
  });

  const send = (message: Record<string, unknown>): void => {
    if (!open) {
      return;
    }
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  return {
    stdoutLines: () => stdoutLines,
    stderr: () => stderrText,
    request: (id, method, params) =>
      new Promise<JsonRpcMessage | null>((resolve) => {
        waiting.set(id, resolve);
        send({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
      }),
    notify: (method, params) => {
      send({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) });
    },
  };
}

function startEntry(t: TestContext): Peer {
  const child = spawn(process.execPath, [ENTRY], {
    cwd: PACKAGE_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill("SIGKILL");
  });
  return openPeer(child);
}

function spelled(message: JsonRpcMessage | null): string {
  return message === null ? "nothing" : JSON.stringify(message);
}

// The result of a request that answered with one; no answer and an error answer
// are failures whose message says which of the two happened.
function resultOf(
  message: JsonRpcMessage | null,
  label: string,
  peer: Peer,
): Record<string, unknown> {
  if (message === null) {
    assert.fail(
      `${label} answered nothing; stdout: ${JSON.stringify(peer.stdoutLines())}; stderr: ${peer.stderr()}`,
    );
  }
  if (message.error !== undefined) {
    assert.fail(`${label} answered an error: ${JSON.stringify(message.error)}`);
  }
  const result = message.result;
  assert.equal(typeof result, "object", `${label} answered no result: ${spelled(message)}`);
  return result as Record<string, unknown>;
}

// The lines the entry wrote that are not JSON-RPC messages; an empty list is the
// guarantee that stdout carries protocol and nothing else.
function noiseOf(peer: Peer): string[] {
  return peer.stdoutLines().filter((line) => parseLine(line) === null);
}

// The verbs the listing advertises, sorted so the assertion names the set and not
// the order the registry happens to keep.
function toolNamesOf(result: Record<string, unknown>): string[] {
  const tools = result.tools;
  assert.equal(
    Array.isArray(tools),
    true,
    `tools/list answered no tools array: ${JSON.stringify(result)}`,
  );
  return (tools as readonly { readonly name?: unknown }[])
    .map((tool) => String(tool.name))
    .sort();
}

// The opening exchange every MCP client performs, answered by the entry itself;
// each case starts from a connection the server considers initialized.
async function initialize(peer: Peer): Promise<JsonRpcMessage | null> {
  const answered = await peer.request(1, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "protocol-check", version: "0.0.0" },
  });
  peer.notify("notifications/initialized");
  return answered;
}

it(
  "answers initialize over stdio and writes nothing but protocol lines to stdout",
  { timeout: 20_000 },
  async (t) => {
    const peer = startEntry(t);
    const answered = await initialize(peer);

    assert.deepEqual(
      noiseOf(peer),
      [],
      `stdout carried lines that are not JSON-RPC messages; stderr: ${peer.stderr()}`,
    );
    const result = resultOf(answered, "initialize", peer);
    assert.equal(result.protocolVersion, PROTOCOL_VERSION);
    assert.equal(typeof result.serverInfo, "object", "initialize answered no serverInfo");
    assert.equal(
      (result.serverInfo as Record<string, unknown>).name,
      DECLARED_PACKAGE_NAME,
      "the server identifies itself with the name the manifest declares",
    );
  },
);

it("lists exactly the measure and preview verbs over stdio", { timeout: 20_000 }, async (t) => {
  const peer = startEntry(t);
  resultOf(await initialize(peer), "initialize", peer);

  const answered = await peer.request(2, "tools/list");
  const result = resultOf(answered, "tools/list", peer);

  assert.deepEqual(toolNamesOf(result), ["measure", "preview"]);
});

// The error body travels as one text block, so a caller parses that block: the shape
// of the document is the contract, not the prose a transport might write around it.
function textBodyOf(result: Record<string, unknown>, label: string): unknown {
  const content = result.content;
  assert.equal(
    Array.isArray(content),
    true,
    `${label} answered no content array: ${JSON.stringify(result)}`,
  );
  const [first] = content as readonly { readonly type?: unknown; readonly text?: unknown }[];
  assert.equal(first?.type, "text", `${label} answered no text block: ${JSON.stringify(result)}`);
  const text = String(first?.text);
  try {
    return JSON.parse(text);
  } catch {
    assert.fail(`${label} answered a body that is not JSON: ${JSON.stringify(text)}`);
  }
}

// The schema each verb advertises, read by name so the assertion names the verb.
function inputSchemaOf(result: Record<string, unknown>, name: string): Record<string, unknown> {
  const tools = result.tools;
  assert.equal(
    Array.isArray(tools),
    true,
    `tools/list answered no tools array: ${JSON.stringify(result)}`,
  );
  const listed = (tools as readonly { readonly name?: unknown }[]).find(
    (tool) => tool.name === name,
  );
  assert.notEqual(listed, undefined, `tools/list advertises no ${name} verb`);
  const schema = (listed as { readonly inputSchema?: unknown }).inputSchema;
  assert.equal(
    typeof schema,
    "object",
    `the ${name} verb advertises no inputSchema: ${JSON.stringify(listed)}`,
  );
  return schema as Record<string, unknown>;
}

// R1: a request either verb declares no field for is refused by that verb's own
// validation, so the answer carries the typed body both surfaces print (D8) instead
// of a sentence the transport wrote. The listing keeps `additionalProperties: false`
// in the same case, so a fix that drops the strict schema from the wire cannot pass.
it(
  "refuses an argument neither verb declares with the typed PARAM_INVALID body",
  { timeout: 20_000 },
  async (t) => {
    const peer = startEntry(t);
    resultOf(await initialize(peer), "initialize", peer);

    const listed = resultOf(await peer.request(2, "tools/list"), "tools/list", peer);
    for (const name of ["measure", "preview"]) {
      assert.equal(
        inputSchemaOf(listed, name).additionalProperties,
        false,
        `the ${name} schema still refuses a field it does not declare`,
      );
    }

    let id = 3;
    for (const name of ["measure", "preview"]) {
      const label = `${name} tools/call`;
      const answered = await peer.request(id, "tools/call", { name, arguments: { bogus: 1 } });
      id += 1;
      const result = resultOf(answered, label, peer);

      assert.equal(
        result.isError,
        true,
        `${label} answered a request it cannot serve as a success: ${spelled(answered)}`,
      );
      assert.equal(
        Object.hasOwn(result, "structuredContent"),
        false,
        `${label} answered structured content for a refused request: ${spelled(answered)}`,
      );
      const body = textBodyOf(result, label) as { readonly error?: { readonly code?: unknown } };
      assert.equal(
        body.error?.code,
        "PARAM_INVALID",
        `${label} answered a code other than the one a refused request carries: ${spelled(answered)}`,
      );
    }
  },
);

// R1: the advertised schema leaves which mode a scope carries to the resolver, so a
// request that names no mode is a document the service reads and not a shape the
// transport refuses. The answer names the absence with its own code, which is what
// makes the distinction reachable from the wire at all.
it(
  "answers a measure request carrying no scope mode with the typed SCOPE_MISSING body",
  { timeout: 20_000 },
  async (t) => {
    const peer = startEntry(t);
    resultOf(await initialize(peer), "initialize", peer);

    const label = "measure tools/call with an empty scope";
    const answered = await peer.request(2, "tools/call", {
      name: "measure",
      arguments: { scope: {} },
    });
    const result = resultOf(answered, label, peer);

    assert.equal(
      result.isError,
      true,
      `${label} answered a request it cannot serve as a success: ${spelled(answered)}`,
    );
    assert.equal(
      Object.hasOwn(result, "structuredContent"),
      false,
      `${label} answered structured content for a refused request: ${spelled(answered)}`,
    );
    const body = textBodyOf(result, label) as { readonly error?: { readonly code?: unknown } };
    assert.equal(
      body.error?.code,
      "SCOPE_MISSING",
      `${label} answered a code other than the one a request with no scope mode carries: ${spelled(answered)}`,
    );
  },
);
