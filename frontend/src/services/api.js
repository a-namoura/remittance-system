
const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

export async function apiRequest(path, { method = "GET", body, token } = {}) {
  const finalToken = token ?? localStorage.getItem("token") ?? null;

  const headers = {
    "Content-Type": "application/json",
  };

  if (finalToken) {
    headers.Authorization = `Bearer ${finalToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}
