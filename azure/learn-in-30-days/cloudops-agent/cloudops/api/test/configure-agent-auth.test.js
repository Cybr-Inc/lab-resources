const test = require("node:test");
const assert = require("node:assert/strict");
const { getToken } = require("../../../scripts/configure-agent");

test("getToken uses the Terraform service principal when ARM credentials exist", async () => {
  let request;
  const token = await getToken({
    env: {
      ARM_CLIENT_ID: "terraform-client",
      ARM_CLIENT_SECRET: "terraform-secret",
      ARM_TENANT_ID: "terraform-tenant"
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        async json() {
          return { access_token: "terraform-token" };
        }
      };
    },
    execFile() {
      throw new Error("Azure CLI must not be used when ARM credentials exist.");
    }
  });

  assert.equal(token, "terraform-token");
  assert.equal(
    request.url,
    "https://login.microsoftonline.com/terraform-tenant/oauth2/v2.0/token"
  );
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body.get("client_id"), "terraform-client");
  assert.equal(request.options.body.get("client_secret"), "terraform-secret");
  assert.equal(request.options.body.get("grant_type"), "client_credentials");
  assert.equal(request.options.body.get("scope"), "https://ai.azure.com/.default");
});

test("getToken falls back to the Azure CLI for local runs", async () => {
  let invocation;
  const token = await getToken({
    env: {},
    fetchImpl() {
      throw new Error("The token endpoint must not be used without ARM credentials.");
    },
    execFile(command, args, options) {
      invocation = { command, args, options };
      return "cli-token\n";
    }
  });

  assert.equal(token, "cli-token");
  assert.equal(invocation.command, "az");
  assert.deepEqual(invocation.args, [
    "account",
    "get-access-token",
    "--scope",
    "https://ai.azure.com/.default",
    "--query",
    "accessToken",
    "--output",
    "tsv"
  ]);
  assert.deepEqual(invocation.options, { encoding: "utf8" });
});
