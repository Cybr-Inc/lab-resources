const { execFileSync } = require("node:child_process");
const definition = require("../agent/definition");

const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT?.replace(/\/$/, "");

async function getToken({
  env = process.env,
  fetchImpl = fetch,
  execFile = execFileSync
} = {}) {
  if (env.ARM_CLIENT_ID && env.ARM_CLIENT_SECRET && env.ARM_TENANT_ID) {
    const body = new URLSearchParams({
      client_id: env.ARM_CLIENT_ID,
      client_secret: env.ARM_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "https://ai.azure.com/.default"
    });
    const response = await fetchImpl(
      `https://login.microsoftonline.com/${env.ARM_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      }
    );
    if (!response.ok) {
      throw new Error(`Token request failed with HTTP ${response.status}`);
    }
    const token = (await response.json()).access_token;
    if (!token) throw new Error("Token response did not include an access token.");
    return token;
  }

  return execFile(
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
  if (!endpoint) throw new Error("FOUNDRY_PROJECT_ENDPOINT is required.");

  const retryable = new Set([403, 404, 409, 429, 500, 502, 503]);
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const agentUrl = `${endpoint}/agents/${encodeURIComponent(definition.agentName)}`;
    const existing = await fetch(`${agentUrl}?api-version=v1`, { headers });

    if (!existing.ok && existing.status !== 404) {
      const detail = await existing.text();
      if (!retryable.has(existing.status) || attempt === 8) {
        throw new Error(`Agent lookup failed with HTTP ${existing.status}: ${detail}`);
      }
      console.log(`Foundry is not ready (HTTP ${existing.status}). Retrying in 15 seconds.`);
      await new Promise((resolve) => setTimeout(resolve, 15000));
      continue;
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
    if (response.ok) {
      const agent = await response.json();
      const version = agent.version ?? agent.versions?.latest?.version;
      console.log(`Configured ${agent.name} version ${version} with ${definition.tools.length} tools.`);
      return;
    }

    const detail = await response.text();
    if (!retryable.has(response.status) || attempt === 8) {
      throw new Error(`Agent configuration failed with HTTP ${response.status}: ${detail}`);
    }
    console.log(`Foundry is not ready (HTTP ${response.status}). Retrying in 15 seconds.`);
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}

if (require.main === module) {
  configureAgent().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { getToken };
