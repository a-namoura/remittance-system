import express from "express";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import { Admin } from "../models/Admin.js";

export const apiRouter = express.Router();

apiRouter.get("/health", (req, res) => {
  res.json({ status: "API running" });
});

apiRouter.get("/db-test", async (req, res) => {
  const [usersCount, walletsCount, txCount, adminsCount] = await Promise.all([
    User.countDocuments(),
    Wallet.countDocuments(),
    Transaction.countDocuments(),
    Admin.countDocuments(),
  ]);

  res.json({
    ok: true,
    counts: {
      users: usersCount,
      wallets: walletsCount,
      transactions: txCount,
      admins: adminsCount,
    },
  });
});
