import { apiRequest } from "./api.js";

export async function createWalletChallenge({ token, address }) {
  return apiRequest("/api/wallet/challenge", {
    method: "POST",
    token,
    body: { address },
  });
}

export async function linkWalletToUser({
  token,
  address,
  signature,
  message,
  challengeId,
}) {
  return apiRequest("/api/wallet/link", {
    method: "POST",
    token,
    body: { address, signature, message, challengeId },
  });
}

export async function unlinkWalletFromUser({ token }) {
  return apiRequest("/api/wallet/link", {
    method: "DELETE",
    token,
  });
}
