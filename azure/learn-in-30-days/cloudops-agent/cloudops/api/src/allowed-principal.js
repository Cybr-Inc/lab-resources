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

function readPrincipal(request) {
  const encodedPrincipal = request.headers.get("x-ms-client-principal");
  if (!encodedPrincipal) return null;

  try {
    return JSON.parse(Buffer.from(encodedPrincipal, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = { isAllowedPrincipal, readPrincipal };
