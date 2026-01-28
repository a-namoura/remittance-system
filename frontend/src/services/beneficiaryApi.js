import { apiRequest } from "./api.js";

export async function listBeneficiaries({ token }) {
  return apiRequest("/api/beneficiaries", { token });
}

export async function createBeneficiary({
  token,
  label,
  username,
  walletAddress,
  notes,
}) {
  return apiRequest("/api/beneficiaries", {
    method: "POST",
    token,
    body: { label, username, walletAddress, notes },
  });
}

export async function deleteBeneficiary({ token, id }) {
  return apiRequest(`/api/beneficiaries/${id}`, {
    method: "DELETE",
    token,
  });
}
