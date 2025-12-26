import express from "express";
import { protect } from "../middleware/authMiddleware.js";

export const walletRouter = express.Router();

// Placeholder
walletRouter.get("/", protect, (req, res) => {
  res.json({ message: "Wallet endpoints coming soon" });
});
