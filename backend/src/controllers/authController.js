import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing in backend/.env");

  return jwt.sign({ userId }, secret, { expiresIn: "7d" });
}

export async function register(req, res) {
  const { email, password, username } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409);
    throw new Error("Email already in use");
  }

  if (password.length < 8) {
    res.status(400);
    throw new Error("Password must be at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    email,
    username,
    passwordHash,
  });

  const token = signToken(user._id);

  res.status(201).json({
    message: "User registered",
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
    token,
  });
}

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user) {
    res.status(401);
    throw new Error("Invalid email or password");
  }

  if (user.isDisabled) {
    res.status(403);
    throw new Error("Account is disabled");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401);
    throw new Error("Invalid email or password");
  }

  const token = signToken(user._id);

  res.json({
    message: "Login successful",
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
    token,
  });
}
