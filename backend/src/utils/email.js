async function sendCodeEmail({ to, code, subject, textBuilder, logLabel }) {
  if (!to || !code) return;

  const normalizedTo = String(to).trim();
  const normalizedCode = String(code).trim();
  if (!normalizedTo || !normalizedCode) return;

  if (!textBuilder(normalizedCode) || !subject) return;
  console.info(`${logLabel} verification code for ${normalizedTo}: ${normalizedCode}`);
}

export async function sendLoginCodeEmail({ to, code }) {
  await sendCodeEmail({
    to,
    code,
    subject: "Your login verification code",
    textBuilder: (normalizedCode) => `Your login verification code is ${normalizedCode}.`,
    logLabel: "Login",
  });
}

export async function sendPasswordResetLinkEmail({ to, resetUrl }) {
  const normalizedTo = String(to || "").trim();
  const normalizedResetUrl = String(resetUrl || "").trim();
  if (!normalizedTo || !normalizedResetUrl) return;

  console.info(`Password reset link generated for ${normalizedTo}: ${normalizedResetUrl}`);
}

export async function sendPaymentCodeEmail({ to, code }) {
  await sendCodeEmail({
    to,
    code,
    subject: "Your payment verification code",
    textBuilder: (normalizedCode) => `Your payment verification code is ${normalizedCode}.`,
    logLabel: "Payment",
  });
}
