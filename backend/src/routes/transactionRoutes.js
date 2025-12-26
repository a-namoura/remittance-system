import express from "express";
import { protect } from "../middleware/authMiddleware.js";

export const transactionRouter = express.Router();

// Placeholder for Week 6/7 features
transactionRouter.get("/", protect, (req, res) => {
  res.json({ message: "Transaction endpoints coming soon" });
});
