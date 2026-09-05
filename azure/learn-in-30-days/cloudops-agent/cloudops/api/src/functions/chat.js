const { AIProjectClient } = require("@azure/ai-projects");
const { app } = require("@azure/functions");
const { credential } = require("../azure-credential");
const { isAllowedPrincipal, readPrincipal } = require("../allowed-principal");
const { getApplicationStatus } = require("../tools/get-application-status");
const { getRunbook } = require("../tools/get-runbook");

const project = new AIProjectClient(process.env.FOUNDRY_PROJECT_ENDPOINT, credential);
const openai = project.getOpenAIClient({
  azureConfig: { allowPreview: true, agentName: process.env.FOUNDRY_AGENT_NAME }
});

const TOOL_HANDLERS = new Map([
  ["get_application_status", getApplicationStatus],
  ["get_runbook", getRunbook]
]);

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
  const words = [...text.matchAll(/\S+/g)];
  if (words.length <= 180) return text;

  const lastWord = words[179];
  return text.slice(0, lastWord.index + lastWord[0].length).trimEnd();
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
        const parsed = JSON.parse(call.arguments);
        args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        args = {};
      }

      const handler = TOOL_HANDLERS.get(call.name);
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
