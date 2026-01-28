import { apiRequest } from "./api.js";

export async function getMyTransactions({
  token,
  limit = 10,
  page = 1,
  status,
  from,
  to,
  view, // "all" | "sent" | "received"
}) {
  const params = new URLSearchParams();

  if (limit) params.set("limit", String(limit));
  if (page) params.set("page", String(page));
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (view && view !== "all") params.set("view", view);

  const qs = params.toString();
  const path = qs ? `/api/transactions/my?${qs}` : "/api/transactions/my";

  return apiRequest(path, { token });
}

export async function getTransactionById({ token, id }) {
  if (!id) {
    throw new Error("Transaction id is required");
  }

  const path = `/api/transactions/${id}`;
  return apiRequest(path, { token });
}
