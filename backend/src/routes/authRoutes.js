import express from "express";
import {
  sendRegisterCode,
  verifyRegisterCode,
  register,
  login,
  verifyCode,
  resendCode,
  logout,
  logRegisterPhoneCode,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

export const authRouter = express.Router();

authRouter.post("/register/send-code", sendRegisterCode);
authRouter.post("/register/verify-code", verifyRegisterCode);
authRouter.post("/register/log-phone-code", logRegisterPhoneCode);
authRouter.post("/register", register);

authRouter.post("/login", login);
authRouter.post("/verify-code", protect, verifyCode);
authRouter.post("/resend-code", protect, resendCode);

authRouter.post("/logout", protect, logout);
