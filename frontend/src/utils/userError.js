const MAX_USER_MESSAGE_LENGTH = 220;

function normalize(value) {
  return String(value || "").trim();
}

function looksTechnical(message) {
  return (
    /jsonrpc|payload|code=|version=|stack|trace|ethers|BrowserProvider|ACTION_REJECTED/i.test(
      message
    ) ||
    /(\{.*\}|\[.*\])/.test(message)
  );
}

function normalizeWalletRejection(message, code) {
  if (String(code || "").trim().toUpperCase() === "ACTION_REJECTED") {
    return "Request cancelled in your wallet.";
  }

  if (
    /user denied|user rejected|rejected the request|request rejected|action_rejected/i.test(
      message
    )
  ) {
    return "Request cancelled in your wallet.";
  }

  return "";
}

function normalizeNetworkIssue(message) {
  if (/failed to fetch|network request failed|networkerror|network error/i.test(message)) {
    return "Network issue. Check your connection and try again.";
  }

  if (/request timed out|timeout|timed out/i.test(message)) {
    return "Request timed out. Please try again.";
  }

  return "";
}

function stripLowLevelDetails(message) {
  if (!message) return "";
  return message
    .replace(/\s*info=\{[\s\S]*$/i, "")
    .replace(/\s*payload=\{[\s\S]*$/i, "")
    .replace(/\s*code=[^,]+,\s*version=[^)]+$/i, "")
    .trim();
}

export function getUserErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const safeFallback = normalize(fallback) || "Something went wrong. Please try again.";
  if (!error) return safeFallback;

  const raw = normalize(typeof error === "string" ? error : error?.message);
  if (!raw) return safeFallback;

  const walletMessage = normalizeWalletRejection(raw, error?.code);
  if (walletMessage) return walletMessage;

  const networkMessage = normalizeNetworkIssue(raw);
  if (networkMessage) return networkMessage;

  const cleaned = stripLowLevelDetails(raw);
  if (!cleaned) return safeFallback;
  if (cleaned.length > MAX_USER_MESSAGE_LENGTH) return safeFallback;
  if (looksTechnical(cleaned)) return safeFallback;

  return cleaned;
}
