const assert = require("node:assert/strict");
const test = require("node:test");
const { isAllowedPrincipal, readPrincipal } = require("../src/allowed-principal");

const USERNAME = "learner@example.onmicrosoft.com";
const ROLE = "lab_learner";

function configure(t, role) {
  const originalRole = process.env.ALLOWED_USER_ROLE;
  const originalUsername = process.env.ALLOWED_USER_NAME;
  t.after(() => {
    if (originalRole === undefined) delete process.env.ALLOWED_USER_ROLE;
    else process.env.ALLOWED_USER_ROLE = originalRole;
    if (originalUsername === undefined) delete process.env.ALLOWED_USER_NAME;
    else process.env.ALLOWED_USER_NAME = originalUsername;
  });
  if (role === undefined) delete process.env.ALLOWED_USER_ROLE;
  else process.env.ALLOWED_USER_ROLE = role;
  process.env.ALLOWED_USER_NAME = USERNAME;
}

function rolePrincipal(overrides = {}) {
  return {
    identityProvider: "aad",
    userId: "opaque-per-app-user-id",
    userDetails: USERNAME,
    userRoles: [ROLE, "anonymous", "authenticated"],
    ...overrides
  };
}

function requestWithHeader(value) {
  return {
    headers: {
      get(name) {
        assert.equal(name, "x-ms-client-principal");
        return value;
      }
    }
  };
}

test("role mode accepts the same enrolled principal with masked or unmasked details", (t) => {
  configure(t, ROLE);
  for (const userDetails of [USERNAME, "lab*****", "Arbitrary display name", undefined, null]) {
    assert.equal(isAllowedPrincipal(rolePrincipal({ userDetails })), true);
  }
  delete process.env.ALLOWED_USER_NAME;
  assert.equal(isAllowedPrincipal(rolePrincipal({ userDetails: "lab*****" })), true);
});

test("role mode denies unenrolled users and never falls back to a matching username or claim", (t) => {
  configure(t, ROLE);
  for (const userDetails of [USERNAME, "other@example.onmicrosoft.com", "lab*****"]) {
    assert.equal(isAllowedPrincipal(rolePrincipal({
      userDetails,
      userRoles: ["anonymous", "authenticated"],
      claims: [{ typ: "upn", val: USERNAME }]
    })), false);
  }
});

test("role mode requires the exact aad provider and the authenticated role", (t) => {
  configure(t, ROLE);
  for (const identityProvider of ["github", "AAD", "", undefined, null]) {
    assert.equal(isAllowedPrincipal(rolePrincipal({ identityProvider })), false);
  }
  assert.equal(isAllowedPrincipal(rolePrincipal({ userRoles: [ROLE, "anonymous"] })), false);
  assert.equal(isAllowedPrincipal(rolePrincipal({ userRoles: [ROLE, "Authenticated"] })), false);
  assert.equal(isAllowedPrincipal(rolePrincipal({ userRoles: [ROLE, "authenticated"] })), true);
});

test("an explicitly empty role fails closed instead of selecting legacy mode", (t) => {
  configure(t, "");
  assert.equal(isAllowedPrincipal(rolePrincipal()), false);
  process.env.ALLOWED_USER_ROLE = "   ";
  assert.equal(isAllowedPrincipal(rolePrincipal()), false);
  process.env.ALLOWED_USER_ROLE = " lab_learner ";
  assert.equal(isAllowedPrincipal(rolePrincipal()), true);
});

test("role mode rejects malformed roles and nonmatching role names", (t) => {
  configure(t, ROLE);
  for (const userRoles of [
    undefined, null, {}, ROLE, [], [ROLE], ["authenticated", "other_role"],
    ["authenticated", "LAB_LEARNER"], ["authenticated", "lab_learner_extra"],
    ["authenticated", ROLE, null], ["authenticated", ROLE, 1],
    ["authenticated", ROLE, {}], ["authenticated", ROLE, [ROLE]],
    ["authenticated", ROLE, ""], ["authenticated", ROLE, "   "]
  ]) {
    assert.equal(isAllowedPrincipal(rolePrincipal({ userRoles })), false);
  }
});

test("both modes reject malformed principal values without throwing", (t) => {
  configure(t, ROLE);
  for (const role of [ROLE, undefined]) {
    if (role === undefined) delete process.env.ALLOWED_USER_ROLE;
    else process.env.ALLOWED_USER_ROLE = role;
    for (const principal of [undefined, null, false, true, 1, USERNAME, [], [rolePrincipal()]]) {
      assert.equal(isAllowedPrincipal(principal), false);
    }
  }
});

test("legacy mode retains normalized exact username matching", (t) => {
  configure(t);
  assert.equal(isAllowedPrincipal({ userDetails: `  ${USERNAME.toUpperCase()}  ` }), true);
  assert.equal(isAllowedPrincipal({ userDetails: "other@example.onmicrosoft.com" }), false);
  assert.equal(isAllowedPrincipal({ userDetails: "lab*****" }), false);
  assert.equal(isAllowedPrincipal({ userDetails: `${USERNAME}.other` }), false);
  assert.equal(isAllowedPrincipal({}), false);
  process.env.ALLOWED_USER_NAME = "   ";
  assert.equal(isAllowedPrincipal({ userDetails: USERNAME }), false);
  delete process.env.ALLOWED_USER_NAME;
  assert.equal(isAllowedPrincipal({ userDetails: USERNAME }), false);
});

test("legacy mode retains all existing username claim types without accepting display-name claims", (t) => {
  configure(t);
  for (const typ of [
    "preferred_username", "upn", "email",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"
  ]) {
    assert.equal(isAllowedPrincipal({ claims: [{ typ, val: ` ${USERNAME.toUpperCase()} ` }] }), true);
    assert.equal(isAllowedPrincipal({ claims: [{ typ, val: "other@example.onmicrosoft.com" }] }), false);
  }
  for (const typ of ["name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"]) {
    assert.equal(isAllowedPrincipal({ name_typ: typ, claims: [{ typ, val: USERNAME }] }), false);
  }
});

test("legacy mode fails closed on malformed claims even with matching userDetails", (t) => {
  configure(t);
  for (const claims of [
    null, {}, "invalid", 1, [null], [[]], ["upn"],
    [{ typ: "upn", val: 1 }], [{ typ: 1, val: USERNAME }], [{}],
    [{ typ: "upn", val: USERNAME }, null]
  ]) {
    assert.equal(isAllowedPrincipal({ userDetails: USERNAME, claims }), false);
  }
  assert.equal(isAllowedPrincipal({ userDetails: null, claims: [{ typ: "upn", val: USERNAME }] }), false);
});

test("readPrincipal decodes a valid UTF-8 SWA principal", () => {
  const principal = rolePrincipal({ userDetails: "Élodie" });
  const encoded = Buffer.from(JSON.stringify(principal), "utf8").toString("base64");
  assert.deepEqual(readPrincipal(requestWithHeader(encoded)), principal);
});

test("readPrincipal rejects missing headers, invalid JSON and nonobject JSON", () => {
  for (const value of [undefined, null, "", 123, "!!!", Buffer.from("not JSON").toString("base64")]) {
    assert.equal(readPrincipal(requestWithHeader(value)), null);
  }
  for (const value of [null, true, 1, "principal", [], [rolePrincipal()]]) {
    const encoded = Buffer.from(JSON.stringify(value)).toString("base64");
    assert.equal(readPrincipal(requestWithHeader(encoded)), null);
  }
  assert.equal(readPrincipal({}), null);
  assert.equal(readPrincipal(null), null);
});
