import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { logAudit } from "../utils/audit.js";
import { sendLoginCodeEmail } from "../utils/email.js";

function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing in backend/.env");
  return jwt.sign({ userId }, secret, { expiresIn: "7d" });
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const registerCodes = new Map();

export async function sendRegisterCode(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  const normalizedEmail = String(email).toLowerCase().trim();
  if (!normalizedEmail.includes("@")) {
    return res.status(400).json({ message: "Invalid email" });
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const code = generateCode();
  const expiresAt = Date.now() + 30 * 1000;

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

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.trim();

  if (password.length < 8) {
    return res.status(400).json({ message: "Password too short" });
  }

  if (await User.findOne({ email: normalizedEmail })) {
    return res.status(409).json({ message: "Email already in use" });
  }

  if (await User.findOne({ username: normalizedUsername })) {
    return res.status(409).json({ message: "Username already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
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

  await logAudit({ user, action: "REGISTER", req });

  const token = signToken(user._id);

  res.status(201).json({
    ok: true,
    token,
  });
}

export async function login(req, res) {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }

  const isEmail = identifier.includes("@");
  const query = isEmail
    ? { email: identifier.toLowerCase() }
    : { username: identifier };

  const user = await User.findOne(query).select("+passwordHash");
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  if (user.isDisabled) return res.status(403).json({ message: "Disabled" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const code = generateCode();
  user.loginCode = code;
  user.loginCodeExpiresAt = new Date(Date.now() + 30 * 1000);
  await user.save();

  await sendLoginCodeEmail({ to: user.email, code });

  const token = signToken(user._id);
  await logAudit({ user, action: "LOGIN_CODE_SENT", req });

  res.json({ token });
}

export async function verifyCode(req, res) {
  const user = req.user;
  const { code } = req.body;

  if (!code) return res.status(400).json({ message: "Code required" });

  if (!user.loginCode || !user.loginCodeExpiresAt) {
    return res.status(400).json({ message: "No active code" });
  }

  if (Date.now() > user.loginCodeExpiresAt.getTime()) {
    user.loginCode = undefined;
    user.loginCodeExpiresAt = undefined;
    await user.save();
    return res.status(400).json({ message: "Code expired" });
  }

  if (user.loginCode !== String(code).trim()) {
    return res.status(400).json({ message: "Invalid code" });
  }

  user.loginCode = undefined;
  user.loginCodeExpiresAt = undefined;
  await user.save();

  await logAudit({ user, action: "LOGIN_VERIFIED", req });

  res.json({ ok: true });
}

export async function resendCode(req, res) {
  const user = req.user;

  const code = generateCode();
  user.loginCode = code;
  user.loginCodeExpiresAt = new Date(Date.now() + 30 * 1000);
  await user.save();

  await sendLoginCodeEmail({ to: user.email, code });
  await logAudit({ user, action: "LOGIN_CODE_RESENT", req });

  res.json({ ok: true });
}

export async function logout(req, res) {
  if (req.user) {
    await logAudit({ user: req.user, action: "LOGOUT", req });
  }
  res.json({ ok: true });
}
