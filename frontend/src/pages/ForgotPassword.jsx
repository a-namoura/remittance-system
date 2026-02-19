import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard.jsx";
import PasswordStrengthIndicator from "../components/PasswordStrengthIndicator.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import { apiRequest } from "../services/api.js";
import { getPasswordPolicyError } from "../utils/passwordPolicy.js";

import { getUserErrorMessage } from "../utils/userError.js";
const STEPS = {
  IDENTIFIER: "identifier",
  CHANNEL: "channel",
  CODE: "code",
  PASSWORD: "password",
};

const CHANNELS = {
  EMAIL: "email",
  PHONE: "phone",
};

const RESEND_DELAY = 30;

const inputBaseClass =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500";
const primaryButtonClass =
  "w-full rounded-full bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-60";
const mutedButtonClass =
  "text-xs text-purple-600 font-medium hover:underline disabled:opacity-60";

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getStepSubtitle(step) {
  if (step === STEPS.IDENTIFIER) {
    return "Enter your username, email, or phone number to recover access.";
  }
  if (step === STEPS.CHANNEL) {
    return "Choose where to receive your verification code.";
  }
  if (step === STEPS.CODE) {
    return "Enter the one-time code sent to you.";
  }
  return "Set a new password for your account.";
}

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState(STEPS.IDENTIFIER);
  const [identifier, setIdentifier] = useState("");
  const [verificationChannel, setVerificationChannel] = useState(
    CHANNELS.EMAIL
  );
  const [availableChannels, setAvailableChannels] = useState({
    email: true,
    phone: true,
  });

  const [pendingToken, setPendingToken] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [deliveryHint, setDeliveryHint] = useState("");

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const subtitle = useMemo(() => getStepSubtitle(step), [step]);
  const phoneDisabled = !availableChannels.phone;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function resetMessages() {
    setError("");
    setInfo("");
  }

  function handleBack() {
    resetMessages();

    if (step === STEPS.IDENTIFIER) {
      navigate("/login");
      return;
    }

    if (step === STEPS.CHANNEL) {
      setStep(STEPS.IDENTIFIER);
      return;
    }

    if (step === STEPS.CODE) {
      setStep(STEPS.CHANNEL);
      return;
    }

    setStep(STEPS.CODE);
  }

  async function submitIdentifier(event) {
    event.preventDefault();
    resetMessages();

    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      setError("Username, email, or phone number is required.");
      return;
    }

    try {
      setLoading(true);

      const response = await apiRequest("/api/auth/forgot-password/options", {
        method: "POST",
        body: { identifier: normalizedIdentifier },
      });

      const channels = {
        email: response?.channels?.email !== false,
        phone: response?.channels?.phone === true,
      };

      setAvailableChannels(channels);
      if (!channels.phone && verificationChannel === CHANNELS.PHONE) {
        setVerificationChannel(CHANNELS.EMAIL);
      }

      setPendingToken("");
      setResetToken("");
      setDeliveryHint("");
      setCode("");
      setCooldown(0);
      setStep(STEPS.CHANNEL);
    } catch (err) {
      setError(getUserErrorMessage(err, "Could not find the account."));
    } finally {
      setLoading(false);
    }
  }

  async function submitChannel(event) {
    event.preventDefault();
    resetMessages();

    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      setError("Username, email, or phone number is required.");
      setStep(STEPS.IDENTIFIER);
      return;
    }

    if (verificationChannel === CHANNELS.PHONE && phoneDisabled) {
      setError("No phone number found for this account.");
      return;
    }

    try {
      setLoading(true);

      const response = await apiRequest("/api/auth/forgot-password/start", {
        method: "POST",
        body: {
          identifier: normalizedIdentifier,
          verificationChannel,
        },
      });

      setPendingToken(response.token || "");
      setDeliveryHint(response.destination || "");
      if (response.verificationChannel) {
        setVerificationChannel(response.verificationChannel);
      }
      setCode("");
      setCooldown(RESEND_DELAY);
      setStep(STEPS.CODE);
    } catch (err) {
      const message = getUserErrorMessage(err, "Failed to send verification code.");
      if (message.toLowerCase().includes("no phone number")) {
        setAvailableChannels((previous) => ({ ...previous, phone: false }));
        setVerificationChannel(CHANNELS.EMAIL);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(event) {
    event.preventDefault();
    resetMessages();

    if (!pendingToken) {
      setError("Session expired. Start recovery again.");
      setStep(STEPS.IDENTIFIER);
      return;
    }

    const trimmedCode = normalizeDigits(code).slice(0, 6);
    if (!trimmedCode) {
      setError("Verification code is required.");
      return;
    }

    try {
      setLoading(true);

      const response = await apiRequest("/api/auth/forgot-password/verify", {
        method: "POST",
        body: {
          token: pendingToken,
          code: trimmedCode,
        },
      });

      setResetToken(response.resetToken || "");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setCooldown(0);
      setStep(STEPS.PASSWORD);
    } catch (err) {
      setError(getUserErrorMessage(err, "Code verification failed."));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (cooldown > 0 || !pendingToken) return;
    resetMessages();

    try {
      setLoading(true);

      const response = await apiRequest("/api/auth/forgot-password/resend", {
        method: "POST",
        body: {
          token: pendingToken,
          verificationChannel,
        },
      });

      setDeliveryHint(response.destination || deliveryHint);
      setCooldown(RESEND_DELAY);
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to resend code."));
    } finally {
      setLoading(false);
    }
  }

  async function submitNewPassword(event) {
    event.preventDefault();
    resetMessages();

    if (!resetToken) {
      setError("Verification session expired. Start recovery again.");
      setStep(STEPS.IDENTIFIER);
      return;
    }

    const passwordError = getPasswordPolicyError(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await apiRequest("/api/auth/forgot-password/reset", {
        method: "POST",
        body: {
          resetToken,
          newPassword,
        },
      });

      setInfo(
        response.message ||
          "Password updated successfully. Redirecting to login..."
      );

      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to reset password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Forgot Password" subtitle={subtitle} onBack={handleBack}>
      {loading && (
        <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <span>Processing...</span>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {info && (
        <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {info}
        </div>
      )}

      {step === STEPS.IDENTIFIER && (
        <form onSubmit={submitIdentifier} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Username, email, or phone number
            </label>
            <input
              type="text"
              className={inputBaseClass}
              placeholder="username / you@example.com / +123..."
              value={identifier}
              maxLength={120}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={primaryButtonClass}
          >
            Continue
          </button>
        </form>
      )}

      {step === STEPS.CHANNEL && (
        <form onSubmit={submitChannel} className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-gray-600">
              Verification code destination
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={phoneDisabled}
                className={`flex-1 rounded-full border px-3 py-2 text-xs font-medium ${
                  phoneDisabled
                    ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                    : verificationChannel === CHANNELS.PHONE
                      ? "border-purple-600 bg-purple-50 text-purple-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
                onClick={() => setVerificationChannel(CHANNELS.PHONE)}
              >
                Phone number
              </button>
              <button
                type="button"
                className={`flex-1 rounded-full border px-3 py-2 text-xs font-medium ${
                  verificationChannel === CHANNELS.EMAIL
                    ? "border-purple-600 bg-purple-50 text-purple-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
                onClick={() => setVerificationChannel(CHANNELS.EMAIL)}
              >
                Email
              </button>
            </div>
            {phoneDisabled && (
              <p className="mt-2 text-xs text-amber-600">
                No phone number found for this account.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className={primaryButtonClass}
          >
            Send verification code
          </button>
        </form>
      )}

      {step === STEPS.CODE && (
        <form onSubmit={submitCode} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Verification code
            </label>
            <input
              inputMode="numeric"
              placeholder="******"
              value={code}
              maxLength={6}
              autoComplete="one-time-code"
              onChange={(event) =>
                setCode(normalizeDigits(event.target.value).slice(0, 6))
              }
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-center font-mono text-sm tracking-[0.3em] focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-2 text-xs text-gray-500">
              Enter the code sent to{" "}
              <span className="font-medium">
                {deliveryHint ||
                  (verificationChannel === CHANNELS.EMAIL
                    ? "your email"
                    : "your phone")}
              </span>
              .
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={primaryButtonClass}
          >
            Verify code
          </button>

          <div className="text-center">
            <button
              type="button"
              disabled={cooldown > 0 || loading}
              onClick={resendCode}
              className={mutedButtonClass}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {step === STEPS.PASSWORD && (
        <form onSubmit={submitNewPassword} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              New password
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                className={`${inputBaseClass} pr-10`}
                placeholder="********"
                value={newPassword}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <div className="absolute inset-y-0 right-2 flex items-center">
                <PasswordVisibilityToggle
                  shown={showNewPassword}
                  onToggle={() => setShowNewPassword((value) => !value)}
                />
              </div>
            </div>
            <PasswordStrengthIndicator password={newPassword} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Confirm new password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                className={`${inputBaseClass} pr-10`}
                placeholder="********"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <div className="absolute inset-y-0 right-2 flex items-center">
                <PasswordVisibilityToggle
                  shown={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((value) => !value)}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={primaryButtonClass}
          >
            Update password
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-gray-600">
        Remembered your password?{" "}
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="font-medium text-purple-600 hover:underline"
        >
          Log in
        </button>
      </p>
    </AuthCard>
  );
}
