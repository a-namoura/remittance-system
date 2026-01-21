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
  params.set("limit", String(limit));
  params.set("page", String(page));

  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const query = params.toString();
  return apiRequest(`/api/transactions/my?${query}`, { token });
}
