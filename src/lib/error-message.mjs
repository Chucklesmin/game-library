export function readableErrorMessage(error, fallback) {
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : typeof error === "string" ? error : "";
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "Could not reach the game service. Check your connection, then refresh the room to retry.";
  if (message.trim()) return message;
  return fallback;
}
