const RUNBOOK_FILES = {
  "api-503": "customer-api-503.md",
  "sign-in": "entra-sign-in-failure.md",
  "blob-upload": "storage-upload-failure.md"
};

async function getRunbook({ category }) {
  const fileName = RUNBOOK_FILES[category];
  if (!fileName) {
    return { found: false, error: "Unknown runbook category" };
  }

  const containerUrl = process.env.RUNBOOK_CONTAINER_URL?.replace(/\/$/, "");
  if (!containerUrl) {
    return { found: false, source: fileName, error: "Runbook container is not configured" };
  }

  try {
    const response = await fetch(`${containerUrl}/${encodeURIComponent(fileName)}`, {
      headers: { Accept: "text/markdown" },
      signal: AbortSignal.timeout(5000)
    });
    if (response.status === 404) {
      return { found: false, source: fileName };
    }
    if (!response.ok) {
      return { found: false, source: fileName, error: `Runbook returned HTTP ${response.status}` };
    }

    const content = await response.text();
    if (content.length > 20000) {
      return { found: false, source: fileName, error: "Runbook exceeds the character limit" };
    }
    return { found: true, source: fileName, content };
  } catch (error) {
    return { found: false, source: fileName, error: error.message };
  }
}

module.exports = { getRunbook };
