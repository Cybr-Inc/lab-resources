const APPLICATIONS = {
  "customer-api": () => process.env.CUSTOMER_API_STATUS_URL
};

async function getApplicationStatus({ application }) {
  const getUrl = APPLICATIONS[application];
  if (!getUrl) {
    return { observed: false, error: "Application is not approved" };
  }

  const url = getUrl();
  if (!url) {
    return { observed: false, application, error: "Status endpoint is not configured" };
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000)
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : { error: (await response.text()).slice(0, 500) };

    return {
      ...body,
      observed: true,
      application,
      httpStatus: response.status
    };
  } catch (error) {
    return { observed: false, application, error: error.message };
  }
}

module.exports = { getApplicationStatus };
