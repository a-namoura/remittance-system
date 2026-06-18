import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api.js";
import AuthCard from "../components/AuthCard.jsx";
import { FieldError, PageLoading, PageNotice } from "../components/PageLayout.jsx";
import SuccessTransition from "../components/SuccessTransition.jsx";
import { SUCCESS_TRANSITION_DURATION_MS } from "../utils/successTransition.js";
import { clearAuthToken, setAuthToken } from "../services/session.js";
import {
  FORM_CODE_INPUT_CLASS,
  FORM_INPUT_BASE_CLASS,
  FORM_MUTED_BUTTON_CLASS,
  FORM_PRIMARY_BUTTON_DISABLED_CLASS,
  formChannelButtonClass,
} from "../styles/formClasses.js";

import { getEmailIdentifierError } from "../utils/emailValidation.js";
import { getUserErrorMessage } from "../utils/userError.js";
const STEPS = {
  CREDENTIALS: "credentials",
  CHANNEL: "channel",
  CODE: "code",
};

const CHANNELS = {
  EMAIL: "email",
  PHONE: "phone",
};

const RESEND_DELAY = 30;

function delay(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getStepSubtitle(step) {
  if (step === STEPS.CREDENTIALS) {
    return "Sign in with your username or email and password.";
  }
  if (step === STEPS.CHANNEL) {
    return "Choose where to receive your verification code.";
  }
  return "Enter the one-time code to complete sign in.";
}

export default function Login() {
  const navigate = useNavigate();

  const [step, setStep] = useState(STEPS.CREDENTIALS);
  const [verificationChannel, setVerificationChannel] = useState(
    CHANNELS.PHONE
  );
  const [availableChannels, setAvailableChannels] = useState({
    email: true,
    phone: true,
  });

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [pendingToken, setPendingToken] = useState("");
  const [deliveryHint, setDeliveryHint] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({
    identifier: "",
    password: "",
    verificationChannel: "",
    code: "",
  });
  const [loading, setLoading] = useState(false);

  const subtitle = useMemo(() => getStepSubtitle(step), [step]);
  const phoneDisabled = !availableChannels.phone;

  useEffect(() => {
    clearAuthToken();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function resetVerificationState() {
    setCode("");
    setPendingToken("");
    setDeliveryHint("");
    setCooldown(0);
  }

  function resetMessages() {
    setError("");
    setInfo("");
    setSuccessMessage("");
    setFieldErrors({
      identifier: "",
      password: "",
      verificationChannel: "",
      code: "",
    });
  }

  function handleBack() {
    resetMessages();

    if (step === STEPS.CREDENTIALS) {
      navigate("/");
      return;
    }

    if (step === STEPS.CHANNEL) {
      resetVerificationState();
      setAvailableChannels({ email: true, phone: true });
      setStep(STEPS.CREDENTIALS);
      return;
    }

    setStep(STEPS.CHANNEL);
  }

  async function submitCredentials(e) {
    e.preventDefault();
    resetMessages();

    const normalizedIdentifier = identifier.trim();
    const nextFieldErrors = {
      identifier: "",
      password: "",
      verificationChannel: "",
      code: "",
    };
    if (!normalizedIdentifier) {
      nextFieldErrors.identifier = "Email or username is required.";
    } else {
      nextFieldErrors.identifier = getEmailIdentifierError(normalizedIdentifier);
    }

    if (!password) {
      nextFieldErrors.password = "Password is required.";
    }

    setFieldErrors(nextFieldErrors);
    if (nextFieldErrors.identifier || nextFieldErrors.password) {
      return;
    }

    try {
      setLoading(true);
      const res = await apiRequest("/api/auth/login/options", {
        method: "POST",
        body: {
          identifier: normalizedIdentifier,
          password,
          authMethod: "identifier",
        },
      });

      const channels = {
        email: res?.channels?.email !== false,
        phone: res?.channels?.phone === true,
      };

      setAvailableChannels(channels);
      if (!channels.phone && verificationChannel === CHANNELS.PHONE) {
        setVerificationChannel(CHANNELS.EMAIL);
      }

      resetVerificationState();
      setStep(STEPS.CHANNEL);
    } catch (err) {
      const message = getUserErrorMessage(err, "Login failed.");
      const targetField = message.toLowerCase().includes("email")
        ? "identifier"
        : "password";
      setFieldErrors((current) => ({
        ...current,
        [targetField]: message,
      }));
    } finally {
      setLoading(false);
    }
  }

  async function submitVerificationChannel(e) {
    e.preventDefault();
    resetMessages();

    const normalizedIdentifier = identifier.trim();
    const identifierError = !normalizedIdentifier
      ? "Email or username is required."
      : getEmailIdentifierError(normalizedIdentifier);
    if (identifierError || !password) {
      setFieldErrors((current) => ({
        ...current,
        identifier: identifierError,
        password: !password ? "Password is required." : "",
      }));
      setStep(STEPS.CREDENTIALS);
      return;
    }

    if (
      verificationChannel === CHANNELS.PHONE &&
      !availableChannels.phone
    ) {
      setFieldErrors((current) => ({
        ...current,
        verificationChannel: "No phone number found for this account.",
      }));
      return;
    }

    try {
      setLoading(true);
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
          identifier: normalizedIdentifier,
          password,
          authMethod: "identifier",
          verificationChannel,
        },
      });

      setPendingToken(res.token || "");
      setDeliveryHint(res.destination || "");
      setCode("");
      setCooldown(RESEND_DELAY);
      setStep(STEPS.CODE);
    } catch (err) {
      const message = getUserErrorMessage(err, "Login failed.");
      if (message.toLowerCase().includes("no phone number")) {
        setAvailableChannels((prev) => ({ ...prev, phone: false }));
        setVerificationChannel(CHANNELS.EMAIL);
        setInfo(message);
        return;
      }

      setFieldErrors((current) => ({
        ...current,
        [message.toLowerCase().includes("email") ? "identifier" : "password"]:
          message,
      }));
      setStep(STEPS.CREDENTIALS);
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    resetMessages();

    if (!pendingToken) {
      setFieldErrors((current) => ({
        ...current,
        password: "Session expired. Please sign in again.",
      }));
      setStep(STEPS.CREDENTIALS);
      return;
    }

    const trimmedCode = normalizeDigits(code).slice(0, 6);
    if (!trimmedCode) {
      setFieldErrors((current) => ({
        ...current,
        code: "Verification code is required.",
      }));
      return;
    }

    try {
      setLoading(true);
      await apiRequest("/api/auth/verify-code", {
        method: "POST",
        token: pendingToken,
        body: { code: trimmedCode },
      });

      setAuthToken(pendingToken);
      setSuccessMessage("Login successful");
      setLoading(false);
      await delay(SUCCESS_TRANSITION_DURATION_MS);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setFieldErrors((current) => ({
        ...current,
        code: getUserErrorMessage(err, "Code verification failed."),
      }));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (cooldown > 0 || !pendingToken) return;
    resetMessages();

    try {
      setLoading(true);
      const res = await apiRequest("/api/auth/resend-code", {
        method: "POST",
        token: pendingToken,
        body: { verificationChannel },
      });
      setDeliveryHint(res.destination || deliveryHint);
      setCooldown(RESEND_DELAY);
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to resend code."));
    } finally {
      setLoading(false);
    }
  }

  function handleForgotPassword() {
    resetMessages();
    navigate("/forgot-password");
  }

  return (
    <>
      <SuccessTransition message={successMessage} />

      <AuthCard title="Login" subtitle={subtitle} onBack={handleBack}>
        {loading ? <PageLoading className="mb-3">Processing...</PageLoading> : null}

      <PageNotice variant="error" className="mb-3">
        {error}
      </PageNotice>

      <PageNotice variant="info" className="mb-3">
        {info}
      </PageNotice>

      {step === STEPS.CREDENTIALS && (
        <form onSubmit={submitCredentials} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Email or username
            </label>
            <input
              type="text"
              className={FORM_INPUT_BASE_CLASS}
              placeholder="you@example.com or username"
              value={identifier}
              maxLength={120}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              onChange={(e) => {
                setIdentifier(e.target.value);
                setFieldErrors((current) => ({ ...current, identifier: "" }));
              }}
            />
            <FieldError>{fieldErrors.identifier}</FieldError>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Password
            </label>
            <input
              className={FORM_INPUT_BASE_CLASS}
              placeholder="********"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((current) => ({ ...current, password: "" }));
              }}
            />
            <FieldError>{fieldErrors.password}</FieldError>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                className={FORM_MUTED_BUTTON_CLASS}
              >
                Forgot password?
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={FORM_PRIMARY_BUTTON_DISABLED_CLASS}
          >
            Continue
          </button>
        </form>
      )}

      {step === STEPS.CHANNEL && (
        <form onSubmit={submitVerificationChannel} className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-gray-600">
              Verification code destination
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={phoneDisabled}
                className={formChannelButtonClass({
                  disabled: phoneDisabled,
                  selected: verificationChannel === CHANNELS.PHONE,
                })}
                onClick={() => setVerificationChannel(CHANNELS.PHONE)}
              >
                Phone number
              </button>
              <button
                type="button"
                className={formChannelButtonClass({
                  selected: verificationChannel === CHANNELS.EMAIL,
                })}
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
            <FieldError>{fieldErrors.verificationChannel}</FieldError>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={FORM_PRIMARY_BUTTON_DISABLED_CLASS}
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
              onChange={(e) =>
                {
                  setCode(normalizeDigits(e.target.value).slice(0, 6));
                  setFieldErrors((current) => ({ ...current, code: "" }));
                }
              }
              className={FORM_CODE_INPUT_CLASS}
            />
            <FieldError>{fieldErrors.code}</FieldError>
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
            className={FORM_PRIMARY_BUTTON_DISABLED_CLASS}
          >
            Verify and sign in
          </button>

          <div className="text-center">
            <button
              type="button"
              disabled={cooldown > 0 || loading}
              onClick={resendCode}
              className={FORM_MUTED_BUTTON_CLASS}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-gray-600">
        Don't have an account?{" "}
        <button
          type="button"
          onClick={() => navigate("/register")}
          className="font-medium text-purple-600 hover:underline"
        >
          Register
        </button>
      </p>
      </AuthCard>
    </>
  );
}
