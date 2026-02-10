import express from "express";
import {
  sendRegisterCode,
  verifyRegisterCode,
  register,
  loginOptions,
  login,
  verifyCode,
  resendCode,
  forgotPasswordOptions,
  forgotPasswordStart,
  forgotPasswordResend,
  forgotPasswordVerify,
  forgotPasswordReset,
  logout,
  logRegisterPhoneCode,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

export const authRouter = express.Router();

authRouter.post("/register/send-code", sendRegisterCode);
authRouter.post("/register/verify-code", verifyRegisterCode);
authRouter.post("/register/log-phone-code", logRegisterPhoneCode);
authRouter.post("/register", register);

authRouter.post("/login/options", loginOptions);
authRouter.post("/login", login);
authRouter.post("/verify-code", protect, verifyCode);
authRouter.post("/resend-code", protect, resendCode);
authRouter.post("/forgot-password/options", forgotPasswordOptions);
authRouter.post("/forgot-password/start", forgotPasswordStart);
authRouter.post("/forgot-password/resend", forgotPasswordResend);
authRouter.post("/forgot-password/verify", forgotPasswordVerify);
authRouter.post("/forgot-password/reset", forgotPasswordReset);

authRouter.post("/logout", protect, logout);
