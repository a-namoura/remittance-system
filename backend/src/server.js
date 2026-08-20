import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { connectDB } from "./config/db.js";
import { apiRouter } from "./routes/index.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { responseSlaMonitor } from "./middleware/performance.js";
import { startTransactionReconciliation } from "./blockchain/transactionReconciliation.js";
import { assertProductionExternalUrls, getFrontendOrigin } from "./config/security.js";
import { installRedactedConsole } from "./utils/logging.js";
import { apiRateLimit } from "./middleware/rateLimit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
  override: process.env.NODE_ENV !== "production",
});

installRedactedConsole();
assertProductionExternalUrls();

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  next();
});
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    if (req.secure || req.get("x-forwarded-proto") === "https") return next();
    return res.redirect(308, `https://${req.get("host")}${req.originalUrl}`);
  });
  app.use((req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });
}

app.use(
  cors({
    origin: [getFrontendOrigin()],
    credentials: true,
  })
);
app.use(express.json());
app.use(responseSlaMonitor);
app.use("/api", apiRateLimit());

// Mount API routes
app.use("/api", apiRouter);

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();
  startTransactionReconciliation();

  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

startServer();
