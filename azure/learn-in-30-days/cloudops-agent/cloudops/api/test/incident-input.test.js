const assert = require("node:assert/strict");
const test = require("node:test");
const { parseIncidentInput } = require("../src/incident-input");

test("accepts and normalizes a valid incident", () => {
  assert.deepEqual(
    parseIncidentInput({ title: "  Customer API returned HTTP 503  ", severity: "HIGH" }),
    { title: "Customer API returned HTTP 503", severity: "high" }
  );
});

test("rejects malformed incident input", () => {
  assert.equal(parseIncidentInput(null), null);
  assert.equal(parseIncidentInput({ title: "", severity: "low" }), null);
  assert.equal(parseIncidentInput({ title: "Valid", severity: "critical" }), null);
  assert.equal(parseIncidentInput({ title: "x".repeat(121), severity: "medium" }), null);
});
