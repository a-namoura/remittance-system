import { useState } from "react";
import AuthCard from "../components/AuthCard";
import { apiRequest } from "../services/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });

      localStorage.setItem("token", data.token);
      location.href = "/dashboard";
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Access your account to send and track remittances."
    >
      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-700 text-sm">{error}</div>}

      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            className="mt-1 w-full border rounded-md px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input
            className="mt-1 w-full border rounded-md px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            placeholder="••••••••"
          />
        </div>

        <button className="w-full bg-blue-600 text-white py-2 rounded-md font-semibold hover:bg-blue-700">
          Sign in
        </button>

        <p className="text-sm text-gray-600">
          Don’t have an account?{" "}
          <a className="text-blue-600 hover:underline" href="/register">
            Create one
          </a>
        </p>
      </form>
    </AuthCard>
  );
}
