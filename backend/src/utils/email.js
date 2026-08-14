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

export async function sendPasswordResetCodeEmail({ to, code }) {
  await sendCodeEmail({
    to,
    code,
    subject: "Your password reset verification code",
    textBuilder: (normalizedCode) =>
      `Your password reset verification code is ${normalizedCode}.`,
    logLabel: "Password reset",
  });
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
