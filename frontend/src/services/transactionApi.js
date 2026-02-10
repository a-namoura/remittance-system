import { apiRequest } from "./api.js";

export async function getMyTransactions({
  token,
  limit = 10,
  page = 1,
  status,
  from,
  to,
  view,
}) {
  const params = new URLSearchParams();

  const numericLimit = Number(limit);
  const numericPage = Number(page);

  if (Number.isFinite(numericLimit) && numericLimit > 0) {
    params.set("limit", String(Math.floor(numericLimit)));
  }
  if (Number.isFinite(numericPage) && numericPage > 0) {
    params.set("page", String(Math.floor(numericPage)));
  }
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (view && view !== "all") params.set("view", view);

  const qs = params.toString();
  const path = qs ? `/api/transactions/my?${qs}` : "/api/transactions/my";

  return apiRequest(path, { token });
}

export async function getTransactionById({ token, id }) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Transaction id is required");
  }

  const path = `/api/transactions/${encodeURIComponent(normalizedId)}`;
  return apiRequest(path, { token });
}
