import assert from "node:assert/strict";
import path from "node:path";
import { it } from "node:test";

import { measureFile } from "../src/metrics.ts";
import type { FileMetrics } from "../src/metrics.ts";
import { openWorkspace } from "../src/workspace.ts";

const FIXTURE_ROOT = path.join(import.meta.dirname, "fixtures", "metrics");

async function readFixture(name: string): Promise<string> {
  const workspace = await openWorkspace(FIXTURE_ROOT);
  return workspace.readText(name);
}

function complexityOf(metrics: FileMetrics, unit: string): number {
  const found = metrics.units.find((candidate) => candidate.name === unit);
  assert.ok(found !== undefined, `unit ${unit} is measured`);
  return found.complexity;
}

it("starts a unit with no decision point at complexity one", async () => {
  const metrics = measureFile("branches.ts", await readFixture("branches.ts"));

  assert.equal(complexityOf(metrics, "straightLine"), 1);
});

it("counts each if and each else if once", async () => {
  const metrics = measureFile("branches.ts", await readFixture("branches.ts"));

  assert.equal(complexityOf(metrics, "ifAndElseIf"), 3);
});

it("counts each case of a switch and leaves default out", async () => {
  const metrics = measureFile("branches.ts", await readFixture("branches.ts"));

  assert.equal(complexityOf(metrics, "switchCases"), 4);
});

it("counts each catch and leaves try out", async () => {
  const metrics = measureFile("branches.ts", await readFixture("branches.ts"));

  assert.equal(complexityOf(metrics, "guardedCatch"), 2);
});

it("counts &&, || and ?? each once", async () => {
  const metrics = measureFile("branches.ts", await readFixture("branches.ts"));

  assert.equal(complexityOf(metrics, "logicalOperators"), 4);
});

it("counts a ternary once", async () => {
  const metrics = measureFile("branches.ts", await readFixture("branches.ts"));

  assert.equal(complexityOf(metrics, "ternaryPick"), 2);
});

it("counts each optional chain once", async () => {
  const metrics = measureFile("branches.ts", await readFixture("branches.ts"));

  assert.equal(complexityOf(metrics, "optionalChain"), 4);
});

it("counts each loop once", async () => {
  const metrics = measureFile("branches.ts", await readFixture("branches.ts"));

  assert.equal(complexityOf(metrics, "everyLoop"), 6);
});

it("reports the lines of code and the function count of a file", async () => {
  const metrics = measureFile("shape.ts", await readFixture("shape.ts"));

  assert.equal(metrics.loc, 12);
  assert.equal(metrics.functions, 2);
});

it("names the most complex unit together with its start line", async () => {
  const metrics = measureFile("shape.ts", await readFixture("shape.ts"));

  assert.deepEqual(metrics.max_complexity, { value: 2, unit: "pickTicket", start_line: 3 });
});

it("keeps a nested unit out of its container complexity", async () => {
  const metrics = measureFile("nested.ts", await readFixture("nested.ts"));

  assert.equal(complexityOf(metrics, "container"), 1);
  assert.equal(complexityOf(metrics, "nested"), 3);
});
