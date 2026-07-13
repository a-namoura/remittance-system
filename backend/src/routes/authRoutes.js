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
import { allowBodyFields, allowQueryFields } from "../middleware/allowFields.js";

export const authRouter = express.Router();

authRouter.use(allowQueryFields([]));

authRouter.post("/register/send-code", allowBodyFields(["email"]), sendRegisterCode);
authRouter.post("/register/verify-code", allowBodyFields(["email", "code"]), verifyRegisterCode);
authRouter.post("/register/log-phone-code", allowBodyFields(["phoneNumber", "code"]), logRegisterPhoneCode);
authRouter.post(
  "/register",
  allowBodyFields([
    "email",
    "password",
    "username",
    "firstName",
    "lastName",
    "countryOfResidence",
    "phoneNumber",
    "dateOfBirth",
    "employmentStatus",
    "sourceOfFunds",
    "expectedMonthlyVolume",
  ]),
  register
);

authRouter.post("/login/options", allowBodyFields(["identifier", "password", "authMethod"]), loginOptions);
authRouter.post(
  "/login",
  allowBodyFields(["identifier", "password", "authMethod", "verificationChannel"]),
  login
);
authRouter.post("/verify-code", protect, allowBodyFields(["code"]), verifyCode);
authRouter.post("/resend-code", protect, allowBodyFields(["verificationChannel"]), resendCode);
authRouter.post("/forgot-password/options", allowBodyFields(["identifier"]), forgotPasswordOptions);
authRouter.post(
  "/forgot-password/start",
  allowBodyFields(["identifier", "verificationChannel"]),
  forgotPasswordStart
);
authRouter.post(
  "/forgot-password/resend",
  allowBodyFields(["token", "verificationChannel"]),
  forgotPasswordResend
);
authRouter.post("/forgot-password/verify", allowBodyFields(["token", "code"]), forgotPasswordVerify);
authRouter.post(
  "/forgot-password/reset",
  allowBodyFields(["resetToken", "newPassword"]),
  forgotPasswordReset
);

authRouter.post("/logout", protect, allowBodyFields([]), logout);
