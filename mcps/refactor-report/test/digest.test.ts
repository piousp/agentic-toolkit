import assert from "node:assert/strict";
import { it } from "node:test";

import { canonicalDigest } from "../src/digest.ts";

it("digests a value as the sha256 of its canonical JSON", () => {
  // sha256 of the exact bytes {"a":1}, computed with sha256sum, not by the implementation.
  assert.equal(
    canonicalDigest({ a: 1 }),
    "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
  );
});

it("ignores key insertion order at every nesting level", () => {
  // sha256 of {"a":3,"b":{"c":2,"d":1}}, computed with sha256sum, not by the implementation.
  assert.deepEqual(
    [canonicalDigest({ b: { d: 1, c: 2 }, a: 3 }), canonicalDigest({ a: 3, b: { c: 2, d: 1 } })],
    [
      "37236d6ef58780baa1b1929c11ca1af86d2f6ba37ec4946de05e04acb25bdfb5",
      "37236d6ef58780baa1b1929c11ca1af86d2f6ba37ec4946de05e04acb25bdfb5",
    ],
  );
});

it("digests CRLF and LF text to the same value", () => {
  assert.equal(canonicalDigest({ text: "a\r\nb" }), canonicalDigest({ text: "a\nb" }));
});
