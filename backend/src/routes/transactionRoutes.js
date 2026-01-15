import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { sendRemittance } from "../blockchain/remittanceClient.js";

export const transactionRouter = express.Router();

transactionRouter.post("/send", protect, async (req, res, next) => {
  try {
    const { receiver, amountEth } = req.body;

    if (!receiver || !amountEth) {
      res.status(400);
      throw new Error("receiver and amountEth are required");
    }

    const result = await sendRemittance(receiver, amountEth);

    res.status(201).json({
      message: "Remittance transaction submitted",
      tx: result,
    });
  } catch (err) {
    next(err);
  }
});

transactionRouter.get("/", protect, (req, res) => {
  res.json({ message: "Transaction endpoints coming soon" });
});
