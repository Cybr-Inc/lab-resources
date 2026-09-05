const { CosmosClient } = require("@azure/cosmos");
const { app } = require("@azure/functions");
const { randomUUID } = require("node:crypto");
const { credential } = require("../azure-credential");
const { isAllowedPrincipal, readPrincipal } = require("../allowed-principal");
const { parseIncidentInput } = require("../incident-input");

function getContainer() {
  const endpoint = process.env.COSMOS_ENDPOINT;
  if (!endpoint) throw new Error("COSMOS_ENDPOINT is not configured");

  const client = new CosmosClient({ endpoint, aadCredentials: credential });
  return client.database("cloudops").container("incidents");
}

function authorize(request) {
  const principal = readPrincipal(request);
  if (!principal) {
    return { status: 401, jsonBody: { error: "Authentication required" } };
  }
  if (!isAllowedPrincipal(principal)) {
    return {
      status: 403,
      jsonBody: { error: "The signed-in Microsoft account does not match the lab account" }
    };
  }
  return null;
}

app.http("incidents", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    const denied = authorize(request);
    if (denied) return denied;

    try {
      const container = getContainer();

      if (request.method === "GET") {
        const query = {
          query: "SELECT TOP 20 * FROM incidents ORDER BY incidents.createdAt DESC"
        };
        const { resources } = await container.items.query(query).fetchAll();
        return { jsonBody: { incidents: resources } };
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return { status: 400, jsonBody: { error: "Send a JSON request body" } };
      }

      const input = parseIncidentInput(body);
      if (!input) {
        return {
          status: 400,
          jsonBody: { error: "Use a title of 1 to 120 characters and a valid severity" }
        };
      }

      const incident = {
        id: randomUUID(),
        title: input.title,
        severity: input.severity,
        status: "open",
        createdAt: new Date().toISOString()
      };
      const { resource } = await container.items.create(incident);
      return { status: 201, jsonBody: { incident: resource } };
    } catch (error) {
      context.error("Incident history request failed", error);
      return { status: 502, jsonBody: { error: "Incident history is unavailable" } };
    }
  }
});

module.exports = { authorize, getContainer };
