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
