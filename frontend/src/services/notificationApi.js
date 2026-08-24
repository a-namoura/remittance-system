import { apiRequest } from "./api.js";

export function listNotifications({ token }) {
  return apiRequest("/api/notifications", { token, trackRequest: false });
}

export function markNotificationRead({ token, id }) {
  return apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH", token });
}

export function markAllNotificationsRead({ token }) {
  return apiRequest("/api/notifications/read-all", { method: "PATCH", token });
}
