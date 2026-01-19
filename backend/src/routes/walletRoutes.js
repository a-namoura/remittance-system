import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { linkWallet } from "../controllers/walletController.js";

export const walletRouter = express.Router();

// Placeholder
walletRouter.get("/", protect, (req, res) => {
  res.json({ message: "Wallet endpoints coming soon" });
});

walletRouter.post("/link", protect, linkWallet);