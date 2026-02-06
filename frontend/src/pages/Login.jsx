import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api.js";
import AuthCard from "../components/AuthCard.jsx";

const STEP_METHOD = "method";
const STEP_CREDENTIALS = "credentials";
const STEP_CODE = "code";

export default function Login() {
  const navigate = useNavigate();

  const [step, setStep] = useState(STEP_METHOD);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    localStorage.removeItem("token");
  }, []);

  useEffect(() => {
    if (!cooldown) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function submitCredentials(e) {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: { identifier, password },
      });

      setPendingToken(res.token);
      setStep(STEP_CODE);
      setCooldown(30);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setError("");

    try {
      await apiRequest("/api/auth/verify-code", {
        method: "POST",
        token: pendingToken,
        body: { code },
      });

      localStorage.setItem("token", pendingToken);
      navigate("/dashboard");
    } catch (e) {
      setError(e.message);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    await apiRequest("/api/auth/resend-code", {
      method: "POST",
      token: pendingToken,
    });
    setCooldown(30);
  }

  return (
    <AuthCard title="Login" onBack={() => navigate("/")}>
      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

      {step === STEP_METHOD && (
        <button
          className="w-full bg-purple-600 text-white rounded-full py-2"
          onClick={() => setStep(STEP_CREDENTIALS)}
        >
          Continue with email
        </button>
      )}

      {step === STEP_CREDENTIALS && (
        <form onSubmit={submitCredentials} className="space-y-4">
          <input
            placeholder="Email or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
          />
          <button className="w-full bg-purple-600 text-white rounded-full py-2">
            Continue
          </button>
        </form>
      )}

      {step === STEP_CODE && (
        <form onSubmit={submitCode} className="space-y-4">
          <input
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-center tracking-widest"
          />
          <button className="w-full bg-purple-600 text-white rounded-full py-2">
            Verify & sign in
          </button>
          <button
            type="button"
            disabled={cooldown > 0}
            onClick={resend}
            className="text-sm text-purple-600"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
