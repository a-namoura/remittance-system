import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard.jsx";
import PasswordStrengthIndicator from "../components/PasswordStrengthIndicator.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import { apiRequest } from "../services/api.js";
import { clearAuthToken, setAuthToken } from "../services/session.js";
import {
  getPasswordPolicyError,
  isPasswordPolicySatisfied,
} from "../utils/passwordPolicy.js";

import { getUserErrorMessage } from "../utils/userError.js";
const STEPS = {
  ACCOUNT: "account",
  PASSWORD: "password",
  PHONE: "phone",
  PHONE_CODE: "phoneCode",
  PROFILE: "profile",
  KYC: "kyc",
};

const RESEND_DELAY = 30;
const CODE_TTL_SECONDS = Number(import.meta.env.VITE_REGISTER_CODE_TTL_SECONDS) || 30;
const CODE_TTL_MS = CODE_TTL_SECONDS * 1000;
const MAX_LOCAL_PHONE_DIGITS = 12;

const COUNTRIES_API = import.meta.env.VITE_COUNTRIES_API;
const FLAG_BASE = import.meta.env.VITE_FLAG_BASE_URL || "";

const DEFAULT_COUNTRY = {
  name: "Palestine",
  flag: FLAG_BASE ? `${FLAG_BASE}/ps.png` : "",
  iso2: "PS",
  iso3: "PSE",
  dialCode: "+970",
  currencies: {},
};

const DEFAULT_SUBTITLE =
  "Register to send, receive, and track cross-border payments securely.";

const STEP_SUBTITLES = {
  [STEPS.ACCOUNT]: "Use your email to create your account.",
  [STEPS.PASSWORD]: "Create a strong password to secure your account.",
  [STEPS.PHONE]: "Add your mobile number and verify it.",
  [STEPS.PHONE_CODE]: "Enter the SMS code we sent to your phone.",
  [STEPS.PROFILE]:
    "Tell us your name and basic details so we can verify your identity.",
  [STEPS.KYC]: "Questions about your employment and source of funds.",
};

const inputBaseClass =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500";
const selectBaseClass =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500";
const primaryButtonClass =
  "w-full rounded-full bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700";
const primaryButtonDisabledClass = `${primaryButtonClass} disabled:opacity-60`;

function generateLocalCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeDigits(value) {
  return value.replace(/\D/g, "");
}

function getDobMaxValue() {
  const today = new Date();
  today.setFullYear(today.getFullYear() - 17);
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isUnder17(dobStr) {
  if (!dobStr) return true;
  const d = new Date(dobStr);
  if (Number.isNaN(d.getTime())) return true;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 17);
  return d > cutoff;
}

const DOB_MAX = getDobMaxValue();
const TOTAL_STEPS = 5;
const CODE_TTL_LABEL =
  CODE_TTL_SECONDS >= 60 && CODE_TTL_SECONDS % 60 === 0
    ? `${CODE_TTL_SECONDS / 60} minute${
        CODE_TTL_SECONDS === 60 ? "" : "s"
      }`
    : `${CODE_TTL_SECONDS} seconds`;

function getStepIndex(step) {
  if (step === STEPS.ACCOUNT) return 0;
  if (step === STEPS.PASSWORD) return 1;
  if (step === STEPS.PHONE || step === STEPS.PHONE_CODE) return 2;
  if (step === STEPS.PROFILE) return 3;
  if (step === STEPS.KYC) return 4;
  return 0;
}

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.ACCOUNT);

  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailCodeExpiresAt, setEmailCodeExpiresAt] = useState(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [countries, setCountries] = useState([]);
  const [countryLoading, setCountryLoading] = useState(false);

  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [expectedPhoneCode, setExpectedPhoneCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneCodeExpiresAt, setPhoneCodeExpiresAt] = useState(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");

  const [employmentStatus, setEmploymentStatus] = useState("");
  const [sourceOfFunds, setSourceOfFunds] = useState("");
  const [monthlyVolume, setMonthlyVolume] = useState("");

  const [agreeGuidelines, setAgreeGuidelines] = useState(false);
  const [agreeAccuracy, setAgreeAccuracy] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    clearAuthToken();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();

    async function loadCountries() {
      if (!COUNTRIES_API) {
        return;
      }

      try {
        setCountryLoading(true);

        const res = await fetch(COUNTRIES_API, { signal: controller.signal });
        if (!res.ok) throw new Error(`Countries API error ${res.status}`);
        const data = await res.json();

        let list = data
          .map((c) => {
            const originalName = c?.name;
            if (!originalName) return null;

            const iso2 = c?.alpha2Code || "";
            const iso3 = c?.alpha3Code || "";

            let dialCode = "";
            if (Array.isArray(c?.callingCodes) && c.callingCodes.length > 0) {
              const raw = String(c.callingCodes[0]).trim();
              if (raw) dialCode = raw.startsWith("+") ? raw : `+${raw}`;
            }

            let flag = "";
            if (FLAG_BASE && iso2) {
              flag = `${FLAG_BASE}/${iso2.toLowerCase()}.png`;
            }

            let displayName = originalName;
            let displayFlag = flag;

            if (originalName.toLowerCase() === "israel") {
              displayName = "Occupied Palestinian Territories";
              displayFlag = FLAG_BASE ? `${FLAG_BASE}/ps.png` : flag;
            }

            if (!displayName) return null;

            return {
              name: displayName,
              flag: displayFlag,
              iso2,
              iso3,
              dialCode,
              currencies: {},
            };
          })
          .filter(Boolean)
          .filter((c) => c.iso2?.toUpperCase() !== "PS")
          .sort((a, b) => a.name.localeCompare(b.name));

        const optName = "Occupied Palestinian Territories";
        const opt = list.find((c) => c.name === optName);
        const rest = list.filter((c) => c.name !== optName);
        if (opt) {
          list = [opt, ...rest];
        }

        if (!isCancelled) {
          setCountries(list);
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          if (!isCancelled) {
            setCountries([]);
          }
        }
      } finally {
        if (!isCancelled) {
          setCountryLoading(false);
        }
      }
    }

    loadCountries();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, []);

  function resetEmailVerification() {
    setEmailVerified(false);
    setEmailCodeSent(false);
    setEmailCode("");
    setEmailCodeExpiresAt(null);
    setInfo("");
  }

  function resetPhoneVerification({ clearPhone = false } = {}) {
    if (clearPhone) setPhone("");
    setExpectedPhoneCode("");
    setPhoneVerified(false);
    setPhoneCode("");
    setPhoneCodeExpiresAt(null);
  }

  function buildFullPhone(localPhone, { allowRawFallback = false } = {}) {
    const digits = normalizeDigits(localPhone || "");
    if (country?.dialCode) return `${country.dialCode}${digits}`;
    return allowRawFallback ? localPhone || "" : digits;
  }

  function isValidEmail(value) {
    return value.includes("@") && value.includes(".");
  }

  function handleBack() {
    setError("");
    setInfo("");

    switch (step) {
      case STEPS.ACCOUNT:
        navigate("/");
        break;
      case STEPS.PASSWORD:
        setStep(STEPS.ACCOUNT);
        break;
      case STEPS.PHONE:
        setStep(STEPS.PASSWORD);
        break;
      case STEPS.PHONE_CODE:
        setStep(STEPS.PHONE);
        setPhoneCode("");
        break;
      case STEPS.PROFILE:
        if (phoneVerified || expectedPhoneCode) {
          setStep(STEPS.PHONE_CODE);
        } else {
          setStep(STEPS.PHONE);
        }
        break;
      case STEPS.KYC:
        setStep(STEPS.PROFILE);
        break;
      default:
        navigate("/");
    }
  }

  const subtitle = STEP_SUBTITLES[step] || DEFAULT_SUBTITLE;
  const currentStepIndex = getStepIndex(step);

  async function handleSendRegisterCode() {
    setError("");
    setInfo("");

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email address is required.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      await apiRequest("/api/auth/register/send-code", {
        method: "POST",
        body: { email: trimmed },
      });
      setEmail(trimmed);
      setEmailCode("");
      setEmailCodeSent(true);
      setEmailVerified(false);
      setEmailCodeExpiresAt(Date.now() + CODE_TTL_MS);
      setShowPassword(false);
      setCooldown(RESEND_DELAY);
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to send code."));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyRegisterCode() {
    setError("");
    setInfo("");

    const trimmed = emailCode.trim();
    if (!trimmed) {
      setError("Please enter the verification code.");
      return;
    }

    if (!emailCodeExpiresAt || Date.now() > emailCodeExpiresAt) {
      resetEmailVerification();
      setError("This email verification code has expired. Please request a new one.");
      return;
    }

    try {
      setLoading(true);
      await apiRequest("/api/auth/register/verify-code", {
        method: "POST",
        body: { email, code: trimmed },
      });
      setEmailVerified(true);
      setCooldown(0);
      setInfo("Email verified successfully. Now create your password.");
      setStep(STEPS.PASSWORD);
    } catch (err) {
      setError(getUserErrorMessage(err, "Verification failed."));
    } finally {
      setLoading(false);
    }
  }

  async function handleAccountContinue() {
    if (!emailVerified) {
      setError("Please verify your email before continuing.");
      return;
    }

    setInfo("Email verified successfully. Now create your password.");
    setStep(STEPS.PASSWORD);
  }

  async function handleAccountSubmit(e) {
    e.preventDefault();
    setError("");

    if (!emailCodeSent) {
      await handleSendRegisterCode();
      return;
    }

    if (!emailVerified) {
      await handleVerifyRegisterCode();
      return;
    }

    await handleAccountContinue();
  }

  async function handleResendRegisterCode() {
    if (cooldown > 0 || emailVerified) return;
    await handleSendRegisterCode();
  }

  function handlePasswordSubmit(e) {
    e.preventDefault();
    setError("");

    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setStep(STEPS.PHONE);
  }

  async function handlePhoneSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmed = phone.trim();
    if (!trimmed) {
      setError("Phone number is required.");
      return;
    }

    const fullPhone = buildFullPhone(trimmed);

    const code = generateLocalCode();
    setExpectedPhoneCode(code);
    setPhone(trimmed);
    setPhoneVerified(false);
    setPhoneCodeExpiresAt(Date.now() + CODE_TTL_MS);
    setStep(STEPS.PHONE_CODE);

    try {
      await apiRequest("/api/auth/register/log-phone-code", {
        method: "POST",
        body: { phoneNumber: fullPhone, code },
      });
    } catch {
      // ignore logging failures for local phone code flow
    }
  }

  function handlePhoneCodeSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmed = phoneCode.trim();
    if (!trimmed) {
      setError("Please enter the verification code.");
      return;
    }

    if (!phoneCodeExpiresAt || Date.now() > phoneCodeExpiresAt) {
      resetPhoneVerification();
      setError("This SMS verification code has expired. Please request a new one.");
      return;
    }

    if (expectedPhoneCode && trimmed !== expectedPhoneCode) {
      setError("Incorrect verification code.");
      return;
    }

    setPhoneVerified(true);
    setStep(STEPS.PROFILE);
  }

  function handleProfileSubmit(e) {
    e.preventDefault();
    setError("");

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter both first and last name.");
      return;
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Username is required.");
      return;
    }
    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }

    if (!dob) {
      setError("Date of birth is required.");
      return;
    }
    if (isUnder17(dob)) {
      setError("You must be at least 17 years old to create an account.");
      return;
    }

    setUsername(trimmedUsername);
    setStep(STEPS.KYC);
  }

  async function handleKycSubmit(e) {
    e.preventDefault();
    setError("");

    if (!employmentStatus) {
      setError("Please choose an employment status.");
      return;
    }

    if (!sourceOfFunds.trim()) {
      setError("Please select your main source of funds.");
      return;
    }
    if (!monthlyVolume.trim()) {
      setError("Please select your estimated monthly deposits/withdrawals.");
      return;
    }

    if (!agreeGuidelines || !agreeAccuracy) {
      setError(
        "You must confirm that you've read the guidelines and that your details are accurate."
      );
      return;
    }

    try {
      setLoading(true);

      const fullPhone = phone
        ? buildFullPhone(phone, { allowRawFallback: true })
        : phone;

      const res = await apiRequest("/api/auth/register", {
        method: "POST",
        body: {
          email,
          username,
          password,
          firstName,
          lastName,
          countryOfResidence: country?.name,
          phoneNumber: fullPhone || undefined,
          dateOfBirth: dob,
          employmentStatus,
          sourceOfFunds,
          expectedMonthlyVolume: monthlyVolume,
        },
      });

      if (res?.token) {
        setAuthToken(res.token);
      }

      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getUserErrorMessage(err, "Registration failed."));
    } finally {
      setLoading(false);
    }
  }

  const canSubmitKyc =
    !!employmentStatus &&
    !!sourceOfFunds &&
    !!monthlyVolume &&
    agreeGuidelines &&
    agreeAccuracy &&
    !loading;
  const canContinueFromPassword = isPasswordPolicySatisfied(password) && !loading;

  return (
    <AuthCard title="Create your account" subtitle={subtitle} onBack={handleBack}>
      <div className="flex justify-center mb-4">
        {Array.from({ length: TOTAL_STEPS }).map((_, idx) => (
          <span
            key={idx}
            className={`h-2 w-2 rounded-full mx-1 ${
              idx === currentStepIndex ? "bg-purple-600" : "bg-gray-300"
            }`}
          />
        ))}
      </div>

      {loading && (
        <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <span>Processing...</span>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {info && step === STEPS.PASSWORD && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {info}
        </div>
      )}

      {step === STEPS.ACCOUNT && (
        <form onSubmit={handleAccountSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email address
            </label>
            <input
              type="email"
              className={inputBaseClass}
              placeholder="you@example.com"
              value={email}
              maxLength={120}
              autoComplete="email"
              disabled={emailCodeSent || emailVerified}
              onChange={(e) => {
                if (emailCodeSent || emailVerified) return;
                setEmail(e.target.value);
                resetEmailVerification();
              }}
            />
          </div>

          {!emailCodeSent && (
            <button
              type="submit"
              disabled={loading}
              className={primaryButtonDisabledClass}
            >
              Send code
            </button>
          )}

          {emailCodeSent && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Verification code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-center tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="******"
                  maxLength={6}
                  value={emailCode}
                  disabled={emailVerified}
                  onChange={(e) =>
                    !emailVerified &&
                    setEmailCode(normalizeDigits(e.target.value).slice(0, 6))
                  }
                />

                {!emailVerified && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={handleVerifyRegisterCode}
                      disabled={loading}
                      className="px-6 py-2 rounded-full bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-60"
                    >
                      Verify
                    </button>
                  </div>
                )}

                {!emailVerified && (
                  <>
                    <p className="mt-2 text-xs text-gray-500 text-center">
                      We sent a one-time code to{" "}
                      <span className="font-medium">{email}</span>.
                    </p>
                    <p className="mt-1 text-xs text-gray-500 text-center">
                      Code is valid for {CODE_TTL_LABEL}.
                    </p>
                  </>
                )}
                {emailVerified && (
                  <p className="mt-2 text-xs text-green-600 text-center">
                    Email verified. Continue to create your password.
                  </p>
                )}

                {!emailVerified && (
                  <div className="mt-2 text-xs text-gray-500 text-center">
                    {cooldown > 0 ? (
                      <span>Resend code in {cooldown}s</span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendRegisterCode}
                        className="text-purple-600 font-medium hover:underline"
                      >
                        Resend code
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading || !emailVerified}
            className={primaryButtonDisabledClass}
          >
            Continue
          </button>
        </form>
      )}

      {step === STEPS.PASSWORD && (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Create a password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className={`${inputBaseClass} pr-10`}
                placeholder="********"
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="absolute inset-y-0 right-2 flex items-center">
                <PasswordVisibilityToggle
                  shown={showPassword}
                  onToggle={() => setShowPassword((value) => !value)}
                />
              </div>
            </div>
            <PasswordStrengthIndicator password={password} />
          </div>

          <button
            type="submit"
            disabled={!canContinueFromPassword}
            className={
              canContinueFromPassword
                ? primaryButtonClass
                : "w-full rounded-full bg-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-500 cursor-not-allowed"
            }
          >
            Continue
          </button>
        </form>
      )}

      {step === STEPS.PHONE && (
        <form onSubmit={handlePhoneSubmit} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Country code
              </label>

              <div className="relative">
                <select
                  className="w-full appearance-none rounded-xl border border-gray-200 pl-11 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  value={country?.name || "Palestine"}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "Palestine") {
                      setCountry(DEFAULT_COUNTRY);
                    } else {
                      const found = countries.find((c) => c.name === value);
                      if (found) setCountry(found);
                    }
                  }}
                >
                  <option value="Palestine">Palestine</option>
                  {countries.map((c) => (
                    <option key={c.iso3 || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <img
                    src={
                      country?.flag || (FLAG_BASE ? `${FLAG_BASE}/ps.png` : "")
                    }
                    alt={country?.name || "Palestine"}
                    className="h-4 w-6 rounded-sm border object-cover"
                  />
                </div>

                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
                  v
                </div>
              </div>

              {countryLoading && (
                <p className="mt-1 text-xs text-gray-500">
                  Loading countries...
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Mobile number
              </label>

              <div className="flex rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-purple-500 bg-white overflow-hidden">
                <div className="flex items-center px-3 text-sm text-gray-700 bg-gray-50 border-r border-gray-200 whitespace-nowrap">
                  {country?.dialCode || "+000"}
                </div>
                <input
                  type="tel"
                  className="flex-1 border-0 px-3 py-2 text-sm focus:outline-none"
                  placeholder="XX XXX XXXX"
                  value={phone}
                  autoComplete="tel-national"
                  onChange={(e) =>
                    setPhone(
                      normalizeDigits(e.target.value).slice(
                        0,
                        MAX_LOCAL_PHONE_DIGITS
                      )
                    )
                  }
                />
              </div>
            </div>
          </div>

          <button type="submit" className={primaryButtonClass}>
            Send SMS code
          </button>

          <button
            type="button"
            onClick={() => {
              resetPhoneVerification({ clearPhone: true });
              setStep(STEPS.PROFILE);
            }}
            className="w-full mt-2 text-xs text-gray-500 hover:underline"
          >
            Can't use your phone number? Skip for now
          </button>
        </form>
      )}

      {step === STEPS.PHONE_CODE && (
        <form onSubmit={handlePhoneCodeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              SMS verification code
            </label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-center tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="******"
              maxLength={6}
              value={phoneCode}
              disabled={phoneVerified}
              onChange={(e) =>
                !phoneVerified &&
                setPhoneCode(normalizeDigits(e.target.value).slice(0, 6))
              }
            />
            <p className="mt-2 text-xs text-gray-500">
              We sent a code to{" "}
              <span className="font-medium">
                {(country?.dialCode || "") + phone}
              </span>
              .
            </p>
            {!phoneVerified && (
              <p className="mt-1 text-xs text-gray-500">
                Code is valid for {CODE_TTL_LABEL}.
              </p>
            )}
            {phoneVerified && (
              <p className="mt-1 text-xs text-green-600">
                Phone number verified.
              </p>
            )}
          </div>

          {!phoneVerified && (
            <button type="submit" className={primaryButtonClass}>
              Verify number
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              resetPhoneVerification({ clearPhone: true });
              setStep(STEPS.PROFILE);
            }}
            className="w-full mt-2 text-xs text-gray-500 hover:underline"
          >
            Can't use your phone number? Skip for now
          </button>
        </form>
      )}

      {step === STEPS.PROFILE && (
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                First name
              </label>
              <input
                type="text"
                className={inputBaseClass}
                value={firstName}
                maxLength={60}
                autoComplete="given-name"
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Last name
              </label>
              <input
                type="text"
                className={inputBaseClass}
                value={lastName}
                maxLength={60}
                autoComplete="family-name"
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Username
            </label>
            <input
              type="text"
              className={inputBaseClass}
              placeholder="yourname"
              value={username}
              maxLength={40}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Date of birth
            </label>
            <input
              type="date"
              className={inputBaseClass}
              value={dob}
              max={DOB_MAX}
              onChange={(e) => setDob(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              You must be at least 17 years old.
            </p>
          </div>

          <button type="submit" className={primaryButtonClass}>
            Continue
          </button>
        </form>
      )}

      {step === STEPS.KYC && (
        <form onSubmit={handleKycSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Employment status
            </label>
            <select
              className={selectBaseClass}
              value={employmentStatus}
              onChange={(e) => setEmploymentStatus(e.target.value)}
            >
              <option value="">Choose one</option>
              <option value="employed">Employed</option>
              <option value="self_employed">Self-employed</option>
              <option value="student">Student</option>
              <option value="unemployed">Unemployed</option>
              <option value="retired">Retired</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Main source of funds
            </label>
            <select
              className={selectBaseClass}
              value={sourceOfFunds}
              onChange={(e) => setSourceOfFunds(e.target.value)}
            >
              <option value="">Select one</option>
              <option value="salary_employment">Salary / employment income</option>
              <option value="business_income">
                Business income / self-employment
              </option>
              <option value="savings_investments">Savings / investments</option>
              <option value="family_support_remittances">
                Family support / transfers
              </option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Estimated monthly deposits / withdrawals
            </label>
            <select
              className={selectBaseClass}
              value={monthlyVolume}
              onChange={(e) => setMonthlyVolume(e.target.value)}
            >
              <option value="">Select one</option>
              <option value="0_500">0 - 500 USD</option>
              <option value="500_1000">500 - 1,000 USD</option>
              <option value="1000_5000">1,000 - 5,000 USD</option>
              <option value="5000_plus">Above 5,000 USD</option>
            </select>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-start gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                checked={agreeGuidelines}
                onChange={(e) => setAgreeGuidelines(e.target.checked)}
              />
              <span>
                I have read and agree to follow the guidelines and terms of use of
                the system.
              </span>
            </label>

            <label className="flex items-start gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                checked={agreeAccuracy}
                onChange={(e) => setAgreeAccuracy(e.target.checked)}
              />
              <span>
                I confirm that all details provided are accurate and complete to
                the best of my knowledge.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={!canSubmitKyc}
            className={primaryButtonDisabledClass}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
      )}

      <p className="mt-6 text-xs text-gray-600 text-center">
        Already have an account?{" "}
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="text-purple-600 font-medium hover:underline"
        >
          Log in
        </button>
      </p>
    </AuthCard>
  );
}
