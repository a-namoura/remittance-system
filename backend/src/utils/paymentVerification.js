import { sendPaymentCodeEmail } from "./email.js";

const VERIFICATION_CHANNELS = {
  EMAIL: "email",
  PHONE: "phone",
};

const PAYMENT_CODE_TTL_MS = 5 * 60 * 1000;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function maskEmail(email) {
  const normalized = String(email || "").trim();
  const [name, domain] = normalized.split("@");
  if (!name || !domain) return normalized;
  const visible = name.slice(0, 1);
  return `${visible}***@${domain}`;
}

function maskPhone(phoneNumber) {
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) return "";
  const digits = normalized.slice(1);
  if (digits.length <= 4) return normalized;
  return `+${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function normalizeVerificationChannel(value) {
  return value === VERIFICATION_CHANNELS.PHONE
    ? VERIFICATION_CHANNELS.PHONE
    : VERIFICATION_CHANNELS.EMAIL;
}

async function sendPaymentCodePhone({ phoneNumber, code }) {
  const normalizedPhone = String(phoneNumber || "").trim();
  const normalizedCode = String(code || "").trim();
  if (!normalizedPhone || !normalizedCode) return;
  console.info(`Payment verification code for ${normalizedPhone}: ${normalizedCode}`);
}

export function clearPaymentCode(user) {
  user.paymentCode = undefined;
  user.paymentCodeExpiresAt = undefined;
  user.paymentCodeChannel = undefined;
}

async function persistPaymentCode(user, { code, expiresAt, channel } = {}) {
  await user.constructor.updateOne(
    { _id: user._id },
    {
      $set: {
        paymentCode: code,
        paymentCodeExpiresAt: expiresAt,
        paymentCodeChannel: channel,
      },
    }
  );

  user.paymentCode = code;
  user.paymentCodeExpiresAt = expiresAt;
  user.paymentCodeChannel = channel;
}

async function removePaymentCode(user) {
  await user.constructor.updateOne(
    { _id: user._id },
    {
      $unset: {
        paymentCode: 1,
        paymentCodeExpiresAt: 1,
        paymentCodeChannel: 1,
      },
    }
  );
  clearPaymentCode(user);
}

export async function sendPaymentVerificationCode({
  user,
  verificationChannel,
} = {}) {
  if (!user) {
    const err = new Error("User is required for payment verification.");
    err.statusCode = 400;
    throw err;
  }

  const channel = normalizeVerificationChannel(verificationChannel);
  const code = generateCode();

  if (channel === VERIFICATION_CHANNELS.PHONE) {
    const phoneNumber = String(user.phoneNumber || "").trim();
    if (!phoneNumber) {
      const err = new Error("No phone number found for this account.");
      err.statusCode = 400;
      throw err;
    }

    await sendPaymentCodePhone({ phoneNumber, code });
    await persistPaymentCode(user, {
      code,
      expiresAt: new Date(Date.now() + PAYMENT_CODE_TTL_MS),
      channel,
    });

    return {
      channel,
      destination: maskPhone(phoneNumber),
      expiresInSeconds: Math.floor(PAYMENT_CODE_TTL_MS / 1000),
    };
  }

  const email = String(user.email || "").trim();
  if (!email) {
    const err = new Error("No email found for this account.");
    err.statusCode = 400;
    throw err;
  }

  await sendPaymentCodeEmail({ to: email, code });
  await persistPaymentCode(user, {
    code,
    expiresAt: new Date(Date.now() + PAYMENT_CODE_TTL_MS),
    channel,
  });

  return {
    channel,
    destination: maskEmail(email),
    expiresInSeconds: Math.floor(PAYMENT_CODE_TTL_MS / 1000),
  };
}

export async function requireAndConsumePaymentCode({ user, code } = {}) {
  if (!user) {
    const err = new Error("User is required.");
    err.statusCode = 400;
    throw err;
  }

  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) {
    const err = new Error("verificationCode is required.");
    err.statusCode = 400;
    throw err;
  }

  if (!user.paymentCode || !user.paymentCodeExpiresAt) {
    const err = new Error("No active payment verification code.");
    err.statusCode = 400;
    throw err;
  }

  if (Date.now() > user.paymentCodeExpiresAt.getTime()) {
    await removePaymentCode(user);
    const err = new Error("Payment verification code expired.");
    err.statusCode = 400;
    throw err;
  }

  if (user.paymentCode !== normalizedCode) {
    const err = new Error("Invalid payment verification code.");
    err.statusCode = 400;
    throw err;
  }

  await removePaymentCode(user);
}
