import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { User } from "./models/User.js";
import { Wallet } from "./models/Wallet.js";
import { Transaction } from "./models/Transaction.js";
import { Admin } from "./models/Admin.js";


dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "API running" });
});
app.get("/api/db-test", async (req, res) => {
  const [usersCount, walletsCount, txCount, adminsCount] = await Promise.all([
    User.countDocuments(),
    Wallet.countDocuments(),
    Transaction.countDocuments(),
    Admin.countDocuments(),
  ]);

  res.json({
    ok: true,
    counts: { users: usersCount, wallets: walletsCount, transactions: txCount, admins: adminsCount },
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

startServer();
