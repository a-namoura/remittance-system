import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { logAudit } from "../utils/audit.js";

function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing in backend/.env");

  return jwt.sign({ userId }, secret, { expiresIn: "7d" });
}

export async function register(req, res) {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    return res
      .status(400)
      .json({ message: "Email, username, and password are required" });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const normalizedUsername = String(username).trim();

  if (normalizedUsername.length < 3) {
    return res
      .status(400)
      .json({ message: "Username must be at least 3 characters" });
  }

  if (normalizedUsername.length > 30) {
    return res
      .status(400)
      .json({ message: "Username must be at most 30 characters" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters" });
  }

  const existingEmail = await User.findOne({ email: normalizedEmail });
  if (existingEmail) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const existingUsername = await User.findOne({ username: normalizedUsername });
  if (existingUsername) {
    return res.status(409).json({ message: "Username already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    email: normalizedEmail,
    username: normalizedUsername,
    passwordHash,
  });

  try {
    await logAudit({
      user,
      action: "REGISTER",
      metadata: { email: user.email, username: user.username },
      req,
    });
  } catch (err) {
    console.error("Failed to write REGISTER audit log:", err.message);
  }

  const token = signToken(user._id);

  res.status(201).json({ token });
}

export async function login(req, res) {
  const { identifier, email, username, password } = req.body;

  if (!password || (!identifier && !email && !username)) {
    return res.status(400).json({
      message: "Identifier (email or username) and password are required",
    });
  }

  // Support old clients that send `email` or `username`,
  // and new ones that send `identifier`
  let rawIdentifier = identifier || email || username;

  rawIdentifier = String(rawIdentifier).trim();
  const isEmail = rawIdentifier.includes("@");

  let query;
  if (isEmail) {
    query = { email: rawIdentifier.toLowerCase() };
  } else {
    query = { username: rawIdentifier };
  }

  const user = await User.findOne(query).select("+passwordHash");

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (user.isDisabled) {
    return res
      .status(403)
      .json({ message: "This account has been disabled" });
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken(user._id);

  try {
    await logAudit({
      user,
      action: "LOGIN",
      metadata: { loginWith: isEmail ? "email" : "username" },
      req,
    });
  } catch (err) {
    console.error("Failed to write LOGIN audit log:", err.message);
  }

  res.json({ token });
}

export async function logout(req, res) {
  const user = req.user;

  if (user) {
    try {
      await logAudit({
        user,
        action: "LOGOUT",
        metadata: {
          email: user.email,
        },
        req,
      });
    } catch (err) {
      console.error("Failed to write LOGOUT audit log:", err.message);
    }
  }

  res.json({
    message: "Logout successful",
  });
}
