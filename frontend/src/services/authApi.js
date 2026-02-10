import { apiRequest } from "./api.js";

export async function getCurrentUser({ token } = {}) {
  const data = await apiRequest("/api/me", { token });
  return data.user || null;
}

export async function logoutCurrentUser({ token } = {}) {
  return apiRequest("/api/auth/logout", {
    method: "POST",
    token,
  });
}
