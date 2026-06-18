import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { logAudit } from "../utils/audit.js";
import {
  sendLoginCodeEmail,
  sendPasswordResetLinkEmail,
} from "../utils/email.js";

const AUTH_METHODS = {
  IDENTIFIER: "identifier",
  PHONE: "phone",
};

const VERIFICATION_CHANNELS = {
  EMAIL: "email",
  PHONE: "phone",
};
const REGISTER_CODE_TTL_MS = 30 * 1000;
const LOGIN_CODE_TTL_MS = 2 * 60 * 1000;
const PASSWORD_RESET_CHALLENGE_TTL = "15m";
const PASSWORD_RESET_LINK_TTL_MS = 15 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_PURPOSES = {
  PASSWORD_RESET_CHALLENGE: "password_reset_challenge",
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing in backend/.env");
  return secret;
}

function signToken(userId) {
  const secret = getJwtSecret();
  return jwt.sign({ userId }, secret, { expiresIn: "7d" });
}

function signPurposeToken(userId, purpose, expiresIn) {
  const secret = getJwtSecret();
  return jwt.sign({ userId, purpose }, secret, { expiresIn });
}

function verifyPurposeToken(rawToken, expectedPurpose) {
  const token = String(rawToken || "").trim();
  if (!token) {
    const err = new Error("Token is required");
    err.statusCode = 400;
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    const err = new Error("Invalid or expired token");
    err.statusCode = 401;
    throw err;
  }

  if (!decoded?.userId || decoded.purpose !== expectedPurpose) {
    const err = new Error("Invalid or expired token");
    err.statusCode = 401;
    throw err;
  }

  return decoded;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

function getDuplicateUserConflictMessage(err) {
  if (err?.code !== 11000) return "";

  const duplicateFields = new Set([
    ...Object.keys(err.keyPattern || {}),
    ...Object.keys(err.keyValue || {}),
  ]);

  if (duplicateFields.has("email")) return "Email already in use";
  if (duplicateFields.has("username")) return "Username already in use";

  return "Account already exists with those details";
}

function hashPasswordResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createPasswordResetToken(user) {
  const token = crypto.randomBytes(32).toString("hex");
  user.passwordResetTokenHash = hashPasswordResetToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_LINK_TTL_MS);
  return token;
}

function clearPasswordResetToken(user) {
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
}

function getFrontendOrigin() {
  const configured =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    process.env.APP_URL ||
    (process.env.WALLET_LINK_DOMAIN
      ? `http://${process.env.WALLET_LINK_DOMAIN}`
      : "");

  return String(configured || "http://localhost:5173").replace(/\/+$/, "");
}

function buildPasswordResetUrl(token) {
  return `${getFrontendOrigin()}/forgot-password?resetToken=${encodeURIComponent(
    token
  )}`;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function normalizeAuthMethod(value) {
  return value === AUTH_METHODS.PHONE
    ? AUTH_METHODS.PHONE
    : AUTH_METHODS.IDENTIFIER;
}

function normalizeVerificationChannel(value) {
  return value === VERIFICATION_CHANNELS.PHONE
    ? VERIFICATION_CHANNELS.PHONE
    : VERIFICATION_CHANNELS.EMAIL;
}

function maskEmail(email) {
  const normalized = String(email || "").trim();
  const [name, domain] = normalized.split("@");
  if (!name || !domain) return normalized;
  const visible = name.slice(0, 1);
  return `${visible}***@${domain}`;
}

function maskPhone(phoneNumber) {
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) return "";
  const digits = normalized.slice(1);
  if (digits.length <= 4) return normalized;
  return `+${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function getLoginQuery({ identifier, authMethod }) {
  const normalizedIdentifier = String(identifier || "").trim();

  if (authMethod === AUTH_METHODS.PHONE) {
    const normalizedPhone = normalizePhone(normalizedIdentifier);
    const digitsOnly = normalizedPhone.slice(1);

    if (!normalizedPhone) {
      return { query: null };
    }

    const candidates = [
      normalizedPhone,
      digitsOnly,
      `00${digitsOnly}`,
    ].filter(Boolean);

    return {
      query: { phoneNumber: { $in: candidates } },
    };
  }

  if (normalizedIdentifier.includes("@")) {
    const normalizedEmail = normalizeEmail(normalizedIdentifier);
    if (!isValidEmail(normalizedEmail)) {
      return { query: null, error: "Invalid email format" };
    }

    return {
      query: { email: normalizedEmail },
    };
  }

  return {
    query: { username: normalizedIdentifier },
  };
}

function getRecoveryQuery(identifier) {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) return { query: null };

  if (normalizedIdentifier.includes("@")) {
    const normalizedEmail = normalizeEmail(normalizedIdentifier);
    if (!isValidEmail(normalizedEmail)) {
      return { query: null, error: "Invalid email format" };
    }

    return {
      query: { email: normalizedEmail },
    };
  }

  const normalizedPhone = normalizePhone(normalizedIdentifier);
  if (normalizedPhone) {
    const digitsOnly = normalizedPhone.slice(1);
    const candidates = [
      normalizedPhone,
      digitsOnly,
      `00${digitsOnly}`,
    ].filter(Boolean);

    return {
      query: {
        $or: [
          { username: normalizedIdentifier },
          { phoneNumber: { $in: candidates } },
        ],
      },
    };
  }

  return {
    query: { username: normalizedIdentifier },
  };
}

function getAvailableChannels(user) {
  const hasPhone = Boolean(String(user?.phoneNumber || "").trim());
  return {
    email: Boolean(user?.email),
    phone: hasPhone,
  };
}

function getPasswordPolicyError(password) {
  const normalizedPassword = String(password || "");
  const missing = [];

  if (normalizedPassword.length < PASSWORD_MIN_LENGTH) {
    missing.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!/[A-Z]/.test(normalizedPassword)) {
    missing.push("one uppercase letter");
  }
  if (!/\d/.test(normalizedPassword)) {
    missing.push("one number");
  }
  if (!/[^A-Za-z0-9]/.test(normalizedPassword)) {
    missing.push("one special character");
  }

  if (missing.length === 0) {
    return "";
  }

  return `Password must include ${missing.join(", ")}.`;
}

async function sendLoginCodePhone({ phoneNumber, code }) {
  const normalizedPhone = String(phoneNumber || "").trim();
  const normalizedCode = String(code || "").trim();
  if (!normalizedPhone || !normalizedCode) return;

  console.log(`Login verification code for ${normalizedPhone}: ${normalizedCode}`);
}

async function deliverLoginCode({ user, code, verificationChannel }) {
  if (verificationChannel === VERIFICATION_CHANNELS.PHONE) {
    const phoneNumber = String(user.phoneNumber || "").trim();
    if (!phoneNumber) {
      const err = new Error("No phone number found for this account");
      err.statusCode = 400;
      throw err;
    }

    await sendLoginCodePhone({ phoneNumber, code });
    return {
      channel: VERIFICATION_CHANNELS.PHONE,
      destination: maskPhone(phoneNumber),
    };
  }

  await sendLoginCodeEmail({ to: user.email, code });
  return {
    channel: VERIFICATION_CHANNELS.EMAIL,
    destination: maskEmail(user.email),
  };
}

function setLoginCode(user, code) {
  user.loginCode = code;
  user.loginCodeExpiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MS);
}

function clearLoginCode(user) {
  user.loginCode = undefined;
  user.loginCodeExpiresAt = undefined;
}

const registerCodes = new Map();

export async function sendRegisterCode(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const code = generateCode();
  const expiresAt = Date.now() + REGISTER_CODE_TTL_MS;

  registerCodes.set(normalizedEmail, { code, expiresAt });

  if (process.env.NODE_ENV === "production") {
    await sendLoginCodeEmail({ to: normalizedEmail, code });
  } else {
    console.log(`Registration code for ${normalizedEmail}: ${code}`);
  }

  res.json({ ok: true });
}

export async function verifyRegisterCode(req, res) {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ message: "Email and code are required" });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const entry = registerCodes.get(normalizedEmail);

  if (!entry) {
    return res.status(400).json({ message: "No active code for this email" });
  }

  if (Date.now() > entry.expiresAt) {
    registerCodes.delete(normalizedEmail);
    return res.status(400).json({ message: "Code expired, request a new one" });
  }

  if (entry.code !== String(code).trim()) {
    return res.status(400).json({ message: "Incorrect code" });
  }

  registerCodes.delete(normalizedEmail);
  res.json({ ok: true });
}

export async function logRegisterPhoneCode(req, res) {
  const { phoneNumber, code } = req.body || {};

  if (!phoneNumber || !code) {
    return res
      .status(400)
      .json({ message: "phoneNumber and code are required" });
  }

  console.log(`Registration phone code for ${phoneNumber}: ${code}`);

  return res.json({ ok: true });
}

export async function register(req, res) {
  const {
    email,
    password,
    username,
    firstName,
    lastName,
    countryOfResidence,
    phoneNumber,
    dateOfBirth,
    employmentStatus,
    sourceOfFunds,
    expectedMonthlyVolume,
  } = req.body;

  if (!email || !password || !username) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = username.trim();

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  const registerPasswordError = getPasswordPolicyError(password);
  if (registerPasswordError) {
    return res.status(400).json({ message: registerPasswordError });
  }

  if (await User.findOne({ email: normalizedEmail })) {
    return res.status(409).json({ message: "Email already in use" });
  }

  if (await User.findOne({ username: normalizedUsername })) {
    return res.status(409).json({ message: "Username already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  try {
    user = await User.create({
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash,
      firstName,
      lastName,
      countryOfResidence,
      phoneNumber,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      employmentStatus,
      sourceOfFunds,
      expectedMonthlyVolume,
    });
  } catch (err) {
    const duplicateMessage = getDuplicateUserConflictMessage(err);
    if (duplicateMessage) {
      return res.status(409).json({ message: duplicateMessage });
    }
    throw err;
  }

  await logAudit({ user, action: "REGISTER", req });

  const token = signToken(user._id);

  res.status(201).json({
    ok: true,
    token,
  });
}

export async function loginOptions(req, res) {
  const { identifier, password, authMethod: rawAuthMethod } = req.body || {};

  if (!identifier || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }

  const authMethod = normalizeAuthMethod(rawAuthMethod);
  const { query, error } = getLoginQuery({ identifier, authMethod });

  if (error) {
    return res.status(400).json({ message: error });
  }
  if (!query) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  const user = await User.findOne(query).select("+passwordHash");
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  if (user.isDisabled) {
    return res.status(403).json({ message: "Account is disabled." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const channels = getAvailableChannels(user);

  res.json({
    channels,
    masked: {
      email: maskEmail(user.email),
      phone: channels.phone ? maskPhone(user.phoneNumber) : "",
    },
  });
}

export async function login(req, res) {
  const {
    identifier,
    password,
    authMethod: rawAuthMethod,
    verificationChannel: rawVerificationChannel,
  } = req.body || {};

  if (!identifier || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }

  const authMethod = normalizeAuthMethod(rawAuthMethod);
  const verificationChannel = normalizeVerificationChannel(rawVerificationChannel);
  const { query, error } = getLoginQuery({ identifier, authMethod });

  if (error) {
    return res.status(400).json({ message: error });
  }
  if (!query) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  const user = await User.findOne(query).select("+passwordHash");
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  if (user.isDisabled) {
    return res.status(403).json({ message: "Account is disabled." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const code = generateCode();
  setLoginCode(user, code);
  await user.save();

  let delivery;
  try {
    delivery = await deliverLoginCode({ user, code, verificationChannel });
  } catch (err) {
    clearLoginCode(user);
    await user.save();

    return res
      .status(err.statusCode || 400)
      .json({ message: err.message || "Failed to send verification code" });
  }

  const token = signToken(user._id);
  await logAudit({ user, action: "LOGIN_CODE_SENT", req });

  res.json({
    token,
    verificationChannel: delivery.channel,
    destination: delivery.destination,
  });
}

export async function verifyCode(req, res) {
  const user = req.user;
  const { code } = req.body;

  if (!code) return res.status(400).json({ message: "Code required" });

  if (!user.loginCode || !user.loginCodeExpiresAt) {
    return res.status(400).json({ message: "No active code" });
  }

  if (Date.now() > user.loginCodeExpiresAt.getTime()) {
    clearLoginCode(user);
    await user.save();
    return res.status(400).json({ message: "Code expired" });
  }

  if (user.loginCode !== String(code).trim()) {
    return res.status(400).json({ message: "Invalid code" });
  }

  clearLoginCode(user);
  await user.save();

  await logAudit({ user, action: "LOGIN_VERIFIED", req });

  res.json({ ok: true });
}

export async function resendCode(req, res) {
  const user = req.user;
  const verificationChannel = normalizeVerificationChannel(
    req.body?.verificationChannel
  );

  const code = generateCode();
  setLoginCode(user, code);
  await user.save();

  let delivery;
  try {
    delivery = await deliverLoginCode({ user, code, verificationChannel });
  } catch (err) {
    clearLoginCode(user);
    await user.save();

    return res
      .status(err.statusCode || 400)
      .json({ message: err.message || "Failed to resend verification code" });
  }

  await logAudit({ user, action: "LOGIN_CODE_RESENT", req });

  res.json({
    ok: true,
    verificationChannel: delivery.channel,
    destination: delivery.destination,
  });
}

export async function forgotPasswordOptions(req, res) {
  const { identifier } = req.body || {};
  const { query, error } = getRecoveryQuery(identifier);

  if (error) {
    return res.status(400).json({ message: error });
  }
  if (!query) {
    return res.status(400).json({ message: "Identifier is required" });
  }

  const user = await User.findOne(query);
  if (!user) {
    return res.status(404).json({ message: "Account not found." });
  }

  if (user.isDisabled) {
    return res.status(403).json({ message: "Account is disabled." });
  }

  const channels = getAvailableChannels(user);

  res.json({
    ok: true,
    channels,
    masked: {
      email: maskEmail(user.email),
      phone: channels.phone ? maskPhone(user.phoneNumber) : "",
    },
  });
}

export async function forgotPasswordStart(req, res) {
  const { identifier, verificationChannel: rawVerificationChannel } =
    req.body || {};

  const { query, error } = getRecoveryQuery(identifier);
  if (error) {
    return res.status(400).json({ message: error });
  }
  if (!query) {
    return res.status(400).json({ message: "Identifier is required" });
  }

  const verificationChannel = normalizeVerificationChannel(rawVerificationChannel);
  const user = await User.findOne(query).select(
    "+loginCode +loginCodeExpiresAt +passwordResetTokenHash +passwordResetExpiresAt"
  );

  if (!user) {
    return res.status(404).json({ message: "Account not found." });
  }

  if (user.isDisabled) {
    return res.status(403).json({ message: "Account is disabled." });
  }

  const channels = getAvailableChannels(user);
  if (verificationChannel === VERIFICATION_CHANNELS.PHONE && !channels.phone) {
    return res
      .status(400)
      .json({ message: "No phone number found for this account" });
  }

  if (verificationChannel === VERIFICATION_CHANNELS.EMAIL) {
    const resetToken = createPasswordResetToken(user);
    clearLoginCode(user);
    await user.save();

    const resetUrl = buildPasswordResetUrl(resetToken);
    try {
      await sendPasswordResetLinkEmail({ to: user.email, resetUrl });
    } catch (err) {
      clearPasswordResetToken(user);
      await user.save();

      return res
        .status(err.statusCode || 400)
        .json({ message: err.message || "Failed to send password reset link" });
    }

    await logAudit({
      user,
      action: "PASSWORD_RESET_LINK_SENT",
      metadata: {
        verificationChannel,
      },
      req,
    });

    return res.json({
      ok: true,
      resetLinkSent: true,
      expiresInMinutes: 15,
      verificationChannel,
      destination: maskEmail(user.email),
    });
  }

  const code = generateCode();
  setLoginCode(user, code);
  await user.save();

  let delivery;
  try {
    delivery = await deliverLoginCode({ user, code, verificationChannel });
  } catch (err) {
    clearLoginCode(user);
    await user.save();

    return res
      .status(err.statusCode || 400)
      .json({ message: err.message || "Failed to send verification code" });
  }

  const token = signPurposeToken(
    user._id,
    TOKEN_PURPOSES.PASSWORD_RESET_CHALLENGE,
    PASSWORD_RESET_CHALLENGE_TTL
  );

  await logAudit({
    user,
    action: "PASSWORD_RESET_CODE_SENT",
    metadata: {
      verificationChannel: delivery.channel,
    },
    req,
  });

  res.json({
    ok: true,
    token,
    verificationChannel: delivery.channel,
    destination: delivery.destination,
  });
}

export async function forgotPasswordResend(req, res) {
  const { token: rawToken, verificationChannel: rawVerificationChannel } =
    req.body || {};

  let decoded;
  try {
    decoded = verifyPurposeToken(
      rawToken,
      TOKEN_PURPOSES.PASSWORD_RESET_CHALLENGE
    );
  } catch (err) {
    return res
      .status(err.statusCode || 401)
      .json({ message: err.message || "Invalid or expired token" });
  }

  const user = await User.findById(decoded.userId).select(
    "+loginCode +loginCodeExpiresAt +passwordResetTokenHash +passwordResetExpiresAt"
  );

  if (!user) {
    return res.status(404).json({ message: "Account not found." });
  }

  if (user.isDisabled) {
    return res.status(403).json({ message: "Account is disabled." });
  }

  const verificationChannel = normalizeVerificationChannel(rawVerificationChannel);
  const channels = getAvailableChannels(user);
  if (verificationChannel === VERIFICATION_CHANNELS.PHONE && !channels.phone) {
    return res
      .status(400)
      .json({ message: "No phone number found for this account" });
  }

  const code = generateCode();
  setLoginCode(user, code);
  await user.save();

  let delivery;
  try {
    delivery = await deliverLoginCode({ user, code, verificationChannel });
  } catch (err) {
    clearLoginCode(user);
    await user.save();

    return res
      .status(err.statusCode || 400)
      .json({ message: err.message || "Failed to resend verification code" });
  }

  await logAudit({
    user,
    action: "PASSWORD_RESET_CODE_RESENT",
    metadata: {
      verificationChannel: delivery.channel,
    },
    req,
  });

  res.json({
    ok: true,
    verificationChannel: delivery.channel,
    destination: delivery.destination,
  });
}

export async function forgotPasswordVerify(req, res) {
  const { token: rawToken, code } = req.body || {};

  let decoded;
  try {
    decoded = verifyPurposeToken(
      rawToken,
      TOKEN_PURPOSES.PASSWORD_RESET_CHALLENGE
    );
  } catch (err) {
    return res
      .status(err.statusCode || 401)
      .json({ message: err.message || "Invalid or expired token" });
  }

  if (!code) {
    return res.status(400).json({ message: "Code is required" });
  }

  const user = await User.findById(decoded.userId).select(
    "+loginCode +loginCodeExpiresAt"
  );

  if (!user) {
    return res.status(404).json({ message: "Account not found." });
  }

  if (user.isDisabled) {
    return res.status(403).json({ message: "Account is disabled." });
  }

  if (!user.loginCode || !user.loginCodeExpiresAt) {
    return res.status(400).json({ message: "No active code" });
  }

  if (Date.now() > user.loginCodeExpiresAt.getTime()) {
    clearLoginCode(user);
    await user.save();
    return res.status(400).json({ message: "Code expired" });
  }

  if (user.loginCode !== String(code).trim()) {
    return res.status(400).json({ message: "Invalid code" });
  }

  const resetToken = createPasswordResetToken(user);
  clearLoginCode(user);
  await user.save();

  await logAudit({ user, action: "PASSWORD_RESET_VERIFIED", req });

  res.json({
    ok: true,
    resetToken,
  });
}

export async function forgotPasswordReset(req, res) {
  const { resetToken, newPassword } = req.body || {};
  const normalizedResetToken = String(resetToken || "").trim();

  if (!normalizedResetToken) {
    return res.status(400).json({ message: "Token is required" });
  }

  const resetPasswordError = getPasswordPolicyError(newPassword);
  if (resetPasswordError) {
    return res.status(400).json({ message: resetPasswordError });
  }

  const user = await User.findOne({
    passwordResetTokenHash: hashPasswordResetToken(normalizedResetToken),
  }).select(
    "+passwordHash +loginCode +loginCodeExpiresAt +passwordResetTokenHash +passwordResetExpiresAt"
  );

  if (!user) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  if (
    !user.passwordResetExpiresAt ||
    Date.now() > user.passwordResetExpiresAt.getTime()
  ) {
    clearPasswordResetToken(user);
    await user.save();
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  if (user.isDisabled) {
    return res.status(403).json({ message: "Account is disabled." });
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
  if (isSamePassword) {
    return res.status(400).json({
      message: "New password must be different from your current password.",
    });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  clearLoginCode(user);
  clearPasswordResetToken(user);
  await user.save();

  await logAudit({ user, action: "PASSWORD_RESET_COMPLETED", req });

  res.json({
    ok: true,
    message: "Password has been reset successfully.",
  });
}

export async function logout(req, res) {
  if (req.user) {
    await logAudit({ user: req.user, action: "LOGOUT", req });
  }
  res.json({ ok: true });
}
