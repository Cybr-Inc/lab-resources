const { app } = require("@azure/functions");

const APPLICATION = "customer-api";
const RELEASE = "42";
const EXPECTED_SETTING = "ORDERS_API_ENDPOINT";

function currentStatus() {
  const configuredSettingNames = Object.keys(process.env)
    .filter((name) => name.endsWith("_API_ENDPOINT"))
    .sort();
  const endpoint = process.env[EXPECTED_SETTING];

  if (!endpoint) {
    return {
      application: APPLICATION,
      release: RELEASE,
      status: "degraded",
      failedCheck: "orders-api-configuration",
      reason: `${EXPECTED_SETTING} is not configured`,
      expectedSetting: EXPECTED_SETTING,
      configuredSettingNames,
      observedAt: new Date().toISOString()
    };
  }

  return {
    application: APPLICATION,
    release: RELEASE,
    status: "healthy",
    checks: { "orders-api-configuration": "healthy" },
    observedAt: new Date().toISOString()
  };
}

app.http("customer", {
  route: "customer",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => {
    const status = currentStatus();
    if (status.status !== "healthy") {
      return { status: 503, jsonBody: { error: "Customer API unavailable", ...status } };
    }
    return {
      jsonBody: {
        message: "Customer API request completed",
        application: APPLICATION,
        release: RELEASE
      }
    };
  }
});

app.http("status", {
  route: "status",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => {
    const status = currentStatus();
    return { status: status.status === "healthy" ? 200 : 503, jsonBody: status };
  }
});

module.exports = { currentStatus };
