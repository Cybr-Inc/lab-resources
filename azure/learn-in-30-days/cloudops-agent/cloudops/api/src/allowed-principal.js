const USERNAME_CLAIM_TYPES = new Set([
  "preferred_username",
  "upn",
  "email",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"
]);

function isPrincipalObject(principal) {
  return principal !== null && typeof principal === "object" && !Array.isArray(principal);
}

function isAllowedPrincipal(principal) {
  if (!isPrincipalObject(principal)) return false;

  if (process.env.ALLOWED_USER_ROLE !== undefined) {
    const role = process.env.ALLOWED_USER_ROLE.trim();
    return Boolean(role) &&
      principal.identityProvider === "aad" &&
      Array.isArray(principal.userRoles) &&
      principal.userRoles.every((value) => typeof value === "string" && value.trim().length > 0) &&
      principal.userRoles.includes("authenticated") &&
      principal.userRoles.includes(role);
  }

  const allowed = process.env.ALLOWED_USER_NAME?.trim().toLowerCase();
  if (!allowed) return false;

  if (principal.userDetails !== undefined && typeof principal.userDetails !== "string") return false;
  if (principal.claims !== undefined && !Array.isArray(principal.claims)) return false;
  const claims = principal.claims ?? [];
  if (claims.some((claim) =>
    !isPrincipalObject(claim) || typeof claim.typ !== "string" || typeof claim.val !== "string"
  )) return false;

  const usernames = [];
  if (typeof principal.userDetails === "string") {
    usernames.push(principal.userDetails);
  }
  for (const claim of claims) {
    if (USERNAME_CLAIM_TYPES.has(claim.typ)) {
      usernames.push(claim.val);
    }
  }

  return usernames.some((username) => username.trim().toLowerCase() === allowed);
}

function readPrincipal(request) {
  try {
    const encodedPrincipal = request.headers.get("x-ms-client-principal");
    if (typeof encodedPrincipal !== "string" || !encodedPrincipal) return null;

    const principal = JSON.parse(Buffer.from(encodedPrincipal, "base64").toString("utf8"));
    return isPrincipalObject(principal) ? principal : null;
  } catch {
    return null;
  }
}

module.exports = { isAllowedPrincipal, readPrincipal };
