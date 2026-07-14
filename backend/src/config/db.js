import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing. Set it in backend/.env");
  }

  if (process.env.NODE_ENV === "production") {
    let url;
    try { url = new URL(uri); } catch { throw new Error("MONGODB_URI must be a valid MongoDB connection string."); }
    if (!url.username || !url.password || !["mongodb:", "mongodb+srv:"].includes(url.protocol)) {
      throw new Error("Production MONGODB_URI must use an authenticated MongoDB user.");
    }
    if (url.searchParams.get("tls") !== "true" && url.searchParams.get("ssl") !== "true" && url.protocol !== "mongodb+srv:") {
      throw new Error("Production MONGODB_URI must require TLS (use tls=true or mongodb+srv).");
    }
  }

  try {
    await mongoose.connect(uri, { tls: process.env.NODE_ENV === "production" ? true : undefined });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}
