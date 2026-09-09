const SEVERITIES = new Set(["low", "medium", "high"]);

function parseIncidentInput(body) {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const severity = typeof body?.severity === "string"
    ? body.severity.trim().toLowerCase()
    : "";

  if (!title || title.length > 120 || !SEVERITIES.has(severity)) return null;
  return { title, severity };
}

module.exports = { parseIncidentInput };
