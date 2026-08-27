const { execFileSync } = require("node:child_process");
const definition = require("../agent/definition");

const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT?.replace(/\/$/, "");
if (!endpoint) {
  console.error("FOUNDRY_PROJECT_ENDPOINT is required.");
  process.exit(1);
}

function getToken() {
  return execFileSync(
    "az",
    [
      "account",
      "get-access-token",
      "--scope",
      "https://ai.azure.com/.default",
      "--query",
      "accessToken",
      "--output",
      "tsv"
    ],
    { encoding: "utf8" }
  ).trim();
}

async function configureAgent() {
  const token = getToken();
  const headers = { Authorization: `Bearer ${token}` };
  const agentUrl = `${endpoint}/agents/${encodeURIComponent(definition.agentName)}`;
  const existing = await fetch(`${agentUrl}?api-version=v1`, { headers });

  if (!existing.ok && existing.status !== 404) {
    throw new Error(`Agent lookup failed with HTTP ${existing.status}: ${await existing.text()}`);
  }

  const requestUrl = existing.ok
    ? `${agentUrl}/versions?api-version=v1`
    : `${endpoint}/agents?api-version=v1`;
  const body = {
    definition: {
      kind: "prompt",
      model: definition.model,
      instructions: definition.instructions,
      tools: definition.tools
    }
  };
  if (!existing.ok) body.name = definition.agentName;

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Agent configuration failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const agent = await response.json();
  console.log(`Configured ${agent.name} version ${agent.version} with ${definition.tools.length} tools.`);
}

configureAgent().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
