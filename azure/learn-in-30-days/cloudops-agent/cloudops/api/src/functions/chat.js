const { AIProjectClient } = require("@azure/ai-projects");
const { app } = require("@azure/functions");
const { ClientSecretCredential } = require("@azure/identity");
const { getApplicationStatus } = require("../tools/get-application-status");
const { getRunbook } = require("../tools/get-runbook");

const credential = new ClientSecretCredential(
  process.env.FOUNDRY_TENANT_ID,
  process.env.FOUNDRY_CLIENT_ID,
  process.env.FOUNDRY_CLIENT_SECRET
);
const project = new AIProjectClient(process.env.FOUNDRY_PROJECT_ENDPOINT, credential);
const openai = project.getOpenAIClient({
  azureConfig: { allowPreview: true, agentName: process.env.FOUNDRY_AGENT_NAME }
});

const TOOL_HANDLERS = {
  get_application_status: getApplicationStatus,
  get_runbook: getRunbook
};

const USERNAME_CLAIM_TYPES = new Set([
  "preferred_username",
  "upn",
  "email",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"
]);

function isAllowedPrincipal(principal) {
  const allowed = process.env.ALLOWED_USER_NAME?.trim().toLowerCase();
  if (!allowed) return false;

  const usernames = [];
  if (typeof principal?.userDetails === "string") {
    usernames.push(principal.userDetails);
  }
  for (const claim of principal?.claims || []) {
    if (USERNAME_CLAIM_TYPES.has(claim.typ) && typeof claim.val === "string") {
      usernames.push(claim.val);
    }
  }

  return usernames.some((username) => username.trim().toLowerCase() === allowed);
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function createResponse(body) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await openai.responses.create(body);
    } catch (error) {
      if (error.status !== 429 || attempt === 2) throw error;
      await wait(5000);
    }
  }
}

function outputText(response) {
  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n")
    .trim();
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, 180).join(" ");
}

async function runAgent(message) {
  let input = [{ role: "user", content: message }];
  const trace = [];

  for (let round = 1; round <= 3; round += 1) {
    const response = await createResponse({ input, store: false, max_output_tokens: 256 });
    const calls = response.output.filter((item) => item.type === "function_call");
    if (calls.length === 0) {
      const reply = outputText(response);
      if (!reply) throw new Error("Foundry returned an empty response");
      return { reply, trace };
    }

    const toolOutputs = await Promise.all(calls.map(async (call) => {
      let args;
      try {
        args = JSON.parse(call.arguments);
      } catch {
        args = {};
      }

      const handler = TOOL_HANDLERS[call.name];
      const result = handler
        ? await handler(args)
        : { error: "Unsupported function" };
      trace.push({ tool: call.name, arguments: args, result });
      return {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      };
    }));

    input = [...input, ...response.output, ...toolOutputs];
  }

  throw new Error("Foundry exceeded the tool-call round limit");
}

app.http("chat", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    const encodedPrincipal = request.headers.get("x-ms-client-principal");
    if (!encodedPrincipal) {
      return { status: 401, jsonBody: { error: "Authentication required" } };
    }

    const principal = JSON.parse(Buffer.from(encodedPrincipal, "base64").toString("utf8"));
    if (!isAllowedPrincipal(principal)) {
      return {
        status: 403,
        jsonBody: { error: "The signed-in Microsoft account does not match the lab account" }
      };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Send a JSON request body" } };
    }

    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1200) {
      return { status: 400, jsonBody: { error: "Message must contain 1 to 1200 characters" } };
    }

    try {
      return { jsonBody: await runAgent(message) };
    } catch (error) {
      context.error("Agent request failed", error);
      return { status: 502, jsonBody: { error: "The support agent could not complete the request" } };
    }
  }
});

module.exports = { isAllowedPrincipal };
