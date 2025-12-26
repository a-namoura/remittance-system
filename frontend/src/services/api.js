const API_URL = import.meta.env.API_URL || "http://localhost:5000";

export async function apiRequest(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}
