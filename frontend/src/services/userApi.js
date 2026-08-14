import { apiRequest } from "./api.js";

export async function searchUsers({ token, query = "", limit = 8 } = {}) {
  const params = new URLSearchParams();

  const normalizedQuery = String(query || "").trim();
  if (normalizedQuery) {
    params.set("query", normalizedQuery);
  }

  const numericLimit = Number(limit);
  if (Number.isFinite(numericLimit) && numericLimit > 0) {
    params.set("limit", String(Math.floor(numericLimit)));
  }

  const qs = params.toString();
  const path = qs ? `/api/users/search?${qs}` : "/api/users/search";

  return apiRequest(path, { token });
}

export async function updateMyProfile({ token, ...updates } = {}) {
  return apiRequest("/api/users/me", { method: "PATCH", token, body: updates });
}

export async function sendPhoneChangeCode({ token, phoneNumber } = {}) {
  return apiRequest("/api/users/me/phone/send-code", {
    method: "POST", token, body: { phoneNumber },
  });
}

export async function verifyPhoneChange({ token, phoneNumber, code } = {}) {
  return apiRequest("/api/users/me/phone/verify", {
    method: "POST", token, body: { phoneNumber, code },
  });
}

export async function deactivateMyAccount({ token, password } = {}) {
  return apiRequest("/api/users/me/deactivate", {
    method: "POST", token, body: { password },
  });
}

export async function changeMyPassword({ token, currentPassword, newPassword } = {}) {
  return apiRequest("/api/users/me/change-password", {
    method: "POST", token, body: { currentPassword, newPassword },
  });
}

export async function deleteMyAccount({ token, password, confirmation } = {}) {
  return apiRequest("/api/users/me", {
    method: "DELETE", token, body: { password, confirmation },
  });
}

export async function exportMyData({ token } = {}) {
  return apiRequest("/api/users/me/export", { token });
}

export async function listBlockedUsers({ token } = {}) {
  return apiRequest("/api/users/blocked", { token });
}

export async function blockUser({ token, userId } = {}) {
  return apiRequest(`/api/users/blocked/${encodeURIComponent(userId)}`, { method: "POST", token });
}

export async function unblockUser({ token, userId } = {}) {
  return apiRequest(`/api/users/blocked/${encodeURIComponent(userId)}`, { method: "DELETE", token });
}
