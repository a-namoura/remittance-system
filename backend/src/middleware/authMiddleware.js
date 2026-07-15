import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { logAudit } from "../utils/audit.js";

function auditRejectedAuthentication(req, reason) {
  void logAudit({
    action: "AUTH_TOKEN_FAILED",
    metadata: { reason: String(reason || "invalid_token") },
    req,
  });
}

export async function protect(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    auditRejectedAuthentication(req, "missing_token");
    res.status(401);
    return next(new Error("Missing Authorization Bearer token"));
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is missing in backend/.env");

    const decoded = jwt.verify(token, secret);

    const user = await User.findById(decoded.userId).select(
      "+loginCode +loginCodeExpiresAt +paymentCode +paymentCodeExpiresAt +paymentCodeChannel"
    );

    if (!user) {
      auditRejectedAuthentication(req, "user_not_found");
      res.status(401);
      return next(new Error("User not found for token"));
    }

    if (user.isDisabled) {
      auditRejectedAuthentication(req, "account_disabled");
      res.status(403);
      return next(new Error("Account is disabled"));
    }

    if (
      typeof decoded.sessionVersion !== "number" ||
      decoded.sessionVersion !== user.sessionVersion
    ) {
      auditRejectedAuthentication(req, "session_invalid");
      res.status(401);
      return next(new Error("Invalid or expired token"));
    }

    req.user = user;
    next();
  } catch (err) {
    auditRejectedAuthentication(req, "invalid_token");
    res.status(401);
    next(new Error("Invalid or expired token"));
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    res.status(401);
    return next(new Error("Not authenticated"));
  }

  if (req.user.role !== "admin") {
    res.status(403);
    return next(new Error("Admin access only"));
  }

  next();
}
