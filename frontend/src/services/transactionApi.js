import { apiRequest } from "./api.js";

export async function getMyTransactions({
  token,
  limit = 10,
  page = 1,
  status,
  from,
  to,
}) {
  const params = new URLSearchParams();

  if (limit) params.set("limit", String(limit));
  if (page) params.set("page", String(page));
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const qs = params.toString();
  const path = qs ? `/api/transactions/my?${qs}` : "/api/transactions/my";

  return apiRequest(path, { token });
}
