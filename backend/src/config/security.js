function requiredHttpsUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL.`); }
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS in production.`);
  return url.toString().replace(/\/$/, "");
}

export function getFrontendOrigin() {
  const value = process.env.FRONTEND_URL || "http://localhost:5173";
  if (process.env.NODE_ENV === "production") return requiredHttpsUrl(value, "FRONTEND_URL");
  return new URL(value).toString().replace(/\/$/, "");
}

export function assertProductionExternalUrls() {
  if (process.env.NODE_ENV !== "production") return;
  requiredHttpsUrl(process.env.FRONTEND_URL || "", "FRONTEND_URL");
  if (process.env.API_URL) requiredHttpsUrl(process.env.API_URL, "API_URL");
  if (process.env.BSC_TESTNET_RPC_URL) requiredHttpsUrl(process.env.BSC_TESTNET_RPC_URL, "BSC_TESTNET_RPC_URL");
}
