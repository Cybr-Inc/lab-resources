const assert = require("node:assert/strict");
const test = require("node:test");
const { authorize } = require("../src/functions/incidents");
const { isAllowedPrincipal } = require("../src/allowed-principal");

function configure(t, value) {
  const previous = process.env.INCIDENTS_PUBLIC_DEMO;
  if (value === undefined) delete process.env.INCIDENTS_PUBLIC_DEMO;
  else process.env.INCIDENTS_PUBLIC_DEMO = value;
  t.after(() => {
    if (previous === undefined) delete process.env.INCIDENTS_PUBLIC_DEMO;
    else process.env.INCIDENTS_PUBLIC_DEMO = previous;
  });
}

test("public incident demo accepts a request without a user principal", (t) => {
  configure(t, "true");
  assert.equal(authorize({ headers: { get() { throw new Error("No user lookup expected"); } } }), null);
  assert.equal(isAllowedPrincipal(null), false);
});

test("other incident deployments still require authentication", (t) => {
  configure(t, undefined);
  for (const value of [undefined, "false", "", "TRUE", "1"]) {
    if (value === undefined) delete process.env.INCIDENTS_PUBLIC_DEMO;
    else process.env.INCIDENTS_PUBLIC_DEMO = value;
    assert.equal(authorize({ headers: { get: () => null } }).status, 401);
  }
});
