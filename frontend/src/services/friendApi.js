import { apiRequest } from "./api.js";

export async function listFriends({ token }) {
  return apiRequest("/api/friends", { token });
}

export async function createFriend({
  token,
  label,
  username,
  walletAddress,
  notes,
  targetUserId,
}) {
  return apiRequest("/api/friends", {
    method: "POST",
    token,
    body: { label, username, walletAddress, notes, targetUserId },
  });
}

export async function deleteFriend({ token, id }) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Contact id is required");
  }

  return apiRequest(`/api/friends/${encodeURIComponent(normalizedId)}`, {
    method: "DELETE",
    token,
  });
}
