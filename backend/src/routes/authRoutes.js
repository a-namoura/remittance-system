import express from "express";
import { register, login, logout } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

export const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/logout", protect, logout);