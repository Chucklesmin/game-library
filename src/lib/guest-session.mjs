export function isInvalidGuestSessionError(error) {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? error.status : undefined;
  if (status === 401 || status === 403 || status === 404) return true;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return /invalid jwt|user not found|user from sub claim in jwt does not exist/i.test(message);
}
