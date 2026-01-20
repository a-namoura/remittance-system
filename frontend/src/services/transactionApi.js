import { apiRequest } from "./api.js";

export async function getMyTransactions({ token, limit = 10 }) {
  return apiRequest(`/api/transactions/my?limit=${limit}`, { token });
}
