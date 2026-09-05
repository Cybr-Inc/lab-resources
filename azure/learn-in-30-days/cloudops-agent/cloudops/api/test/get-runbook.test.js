const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const test = require("node:test");
const { ContainerClient } = require("@azure/storage-blob");
const { getRunbook } = require("../src/tools/get-runbook");

function configureEnvironment(t) {
  const original = {
    RUNBOOK_CONTAINER_URL: process.env.RUNBOOK_CONTAINER_URL,
    FOUNDRY_TENANT_ID: process.env.FOUNDRY_TENANT_ID,
    FOUNDRY_CLIENT_ID: process.env.FOUNDRY_CLIENT_ID,
    FOUNDRY_CLIENT_SECRET: process.env.FOUNDRY_CLIENT_SECRET
  };
  process.env.RUNBOOK_CONTAINER_URL = "https://example.blob.core.windows.net/runbooks/";
  process.env.FOUNDRY_TENANT_ID = "tenant";
  process.env.FOUNDRY_CLIENT_ID = "client";
  process.env.FOUNDRY_CLIENT_SECRET = "secret";
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("rejects categories outside the runbook allowlist", async (t) => {
  t.mock.method(ContainerClient.prototype, "getBlobClient", () => {
    throw new Error("Blob access must not occur");
  });

  assert.deepEqual(await getRunbook({ category: "../secret" }), {
    found: false,
    error: "Unknown runbook category"
  });
});

test("downloads an allowlisted blob with authentication and a timeout", async (t) => {
  configureEnvironment(t);
  const timeoutSignal = new AbortController().signal;
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 5000);
    return timeoutSignal;
  });
  t.mock.method(ContainerClient.prototype, "getBlobClient", (fileName) => {
    assert.equal(fileName, "customer-api-503.md");
    return {
      download: async (offset, count, options) => {
        assert.equal(offset, 0);
        assert.equal(count, undefined);
        assert.equal(options.abortSignal, timeoutSignal);
        return { readableStreamBody: Readable.from([Buffer.from("Runbook content")]) };
      }
    };
  });

  assert.deepEqual(await getRunbook({ category: "api-503" }), {
    found: true,
    source: "customer-api-503.md",
    content: "Runbook content"
  });
});

test("returns not found without exposing a storage error for HTTP 404", async (t) => {
  configureEnvironment(t);
  t.mock.method(ContainerClient.prototype, "getBlobClient", () => ({
    download: async () => {
      throw Object.assign(new Error("BlobNotFound"), { statusCode: 404 });
    }
  }));

  assert.deepEqual(await getRunbook({ category: "sign-in" }), {
    found: false,
    source: "entra-sign-in-failure.md"
  });
});

test("rejects runbooks over 20,000 characters", async (t) => {
  configureEnvironment(t);
  t.mock.method(ContainerClient.prototype, "getBlobClient", () => ({
    download: async () => ({
      readableStreamBody: Readable.from([Buffer.from("x".repeat(20001))])
    })
  }));

  assert.deepEqual(await getRunbook({ category: "blob-upload" }), {
    found: false,
    source: "storage-upload-failure.md",
    error: "Runbook exceeds the character limit"
  });
});
