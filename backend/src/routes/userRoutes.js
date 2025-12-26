import express from "express";
import { protect } from "../middleware/authMiddleware.js";

export const userRouter = express.Router();

// GET /api/users/me (same as /api/me but nested nicely)
userRouter.get("/me", protect, (req, res) => {
  res.json({
    id: req.user._id,
    email: req.user.email,
    username: req.user.username,
    role: req.user.role,
  });
});
