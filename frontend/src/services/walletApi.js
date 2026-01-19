import { apiRequest } from "./api.js";

export async function linkWalletToUser({ token, address, signature, message }) {
  return apiRequest("/api/wallet/link", {
    method: "POST",
    token,
    body: { address, signature, message },
  });
}
