const { ClientSecretCredential } = require("@azure/identity");
const { ContainerClient } = require("@azure/storage-blob");
const { StringDecoder } = require("node:string_decoder");

const RUNBOOK_FILES = new Map([
  ["api-503", "customer-api-503.md"],
  ["sign-in", "entra-sign-in-failure.md"],
  ["blob-upload", "storage-upload-failure.md"]
]);

async function getRunbook({ category }) {
  const fileName = RUNBOOK_FILES.get(category);
  if (!fileName) {
    return { found: false, error: "Unknown runbook category" };
  }

  const containerUrl = process.env.RUNBOOK_CONTAINER_URL?.replace(/\/$/, "");
  if (!containerUrl) {
    return { found: false, source: fileName, error: "Runbook container is not configured" };
  }

  try {
    const credential = new ClientSecretCredential(
      process.env.FOUNDRY_TENANT_ID,
      process.env.FOUNDRY_CLIENT_ID,
      process.env.FOUNDRY_CLIENT_SECRET
    );
    const container = new ContainerClient(containerUrl, credential);
    const response = await container.getBlobClient(fileName).download(0, undefined, {
      abortSignal: AbortSignal.timeout(5000)
    });

    const decoder = new StringDecoder("utf8");
    let content = "";
    for await (const chunk of response.readableStreamBody) {
      content += decoder.write(chunk);
      if (content.length > 20000) {
        return { found: false, source: fileName, error: "Runbook exceeds the character limit" };
      }
    }
    content += decoder.end();
    if (content.length > 20000) {
      return { found: false, source: fileName, error: "Runbook exceeds the character limit" };
    }

    return { found: true, source: fileName, content };
  } catch (error) {
    if (error.statusCode === 404) {
      return { found: false, source: fileName };
    }
    return { found: false, source: fileName, error: error.message };
  }
}

module.exports = { getRunbook };
