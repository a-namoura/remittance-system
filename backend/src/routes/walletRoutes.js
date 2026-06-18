import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createWalletChallenge,
  linkWallet,
  unlinkWallet,
} from "../controllers/walletController.js";

export const walletRouter = express.Router();

walletRouter.post("/challenge", protect, createWalletChallenge);
walletRouter.post("/link", protect, linkWallet);
walletRouter.delete("/link", protect, unlinkWallet);
