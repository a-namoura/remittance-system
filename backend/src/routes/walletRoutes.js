import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createWalletChallenge,
  createManagedWallet,
  linkWallet,
  unlinkWallet,
} from "../controllers/walletController.js";
import { allowBodyFields, allowQueryFields } from "../middleware/allowFields.js";

export const walletRouter = express.Router();

walletRouter.use(allowQueryFields([]));

walletRouter.post("/challenge", protect, allowBodyFields(["address"]), createWalletChallenge);
walletRouter.post("/create", protect, allowBodyFields([]), createManagedWallet);
walletRouter.post(
  "/link",
  protect,
  allowBodyFields(["address", "signature", "message", "challengeId"]),
  linkWallet
);
walletRouter.delete("/link", protect, allowBodyFields([]), unlinkWallet);
