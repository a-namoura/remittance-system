import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { linkWallet, unlinkWallet } from "../controllers/walletController.js";

export const walletRouter = express.Router();

walletRouter.post("/link", protect, linkWallet);
walletRouter.delete("/link", protect, unlinkWallet);