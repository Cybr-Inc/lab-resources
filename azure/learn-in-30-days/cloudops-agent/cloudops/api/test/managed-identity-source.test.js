const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const sourceRoot = path.resolve(__dirname, "../src");

function readSource(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
}

function readAllSource(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readAllSource(entryPath);
    return entry.name.endsWith(".js") ? [fs.readFileSync(entryPath, "utf8")] : [];
  });
}

test("uses one shared managed identity credential for Foundry and Blob Storage", () => {
  const credentialPath = path.join(sourceRoot, "azure-credential.js");
  assert.equal(
    fs.existsSync(credentialPath),
    true,
    "Apply patches/day-16-managed-identity.patch to add the shared credential"
  );

  const credentialSource = readSource("azure-credential.js");
  const chatSource = readSource("functions/chat.js");
  const runbookSource = readSource("tools/get-runbook.js");
  const allSource = readAllSource(sourceRoot).join("\n");

  assert.match(credentialSource, /new ManagedIdentityCredential\(\)/);
  assert.match(chatSource, /require\("\.\.\/azure-credential"\)/);
  assert.match(runbookSource, /require\("\.\.\/azure-credential"\)/);
  assert.equal((allSource.match(/new ManagedIdentityCredential\(/g) || []).length, 1);
  assert.doesNotMatch(
    allSource,
    /ClientSecretCredential|FOUNDRY_(?:TENANT_ID|CLIENT_ID|CLIENT_SECRET)/
  );
});
