import express from "express";
import { protect } from "../middleware/authMiddleware.js";

export const userRouter = express.Router();

// backend/src/routes/userRoutes.js
userRouter.get("/me", protect, (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      username: req.user.username,
      role: req.user.role,
    },
  });
});
