import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { linkWallet } from "../controllers/walletController.js";

export const walletRouter = express.Router();

walletRouter.post("/link", protect, linkWallet);