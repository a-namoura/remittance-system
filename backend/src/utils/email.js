import https from "node:https";

function hasMailjetConfig() {
  return Boolean(
    process.env.MAILJET_API_KEY &&
      process.env.MAILJET_SECRET_KEY &&
      (process.env.MAILJET_FROM || process.env.EMAIL_FROM)
  );
}

function shouldSendEmail() {
  return process.env.NODE_ENV === "production" || hasMailjetConfig();
}

async function sendMailjetEmail({ to, subject, text }) {
  const apiKey = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  const from = process.env.MAILJET_FROM || process.env.EMAIL_FROM;
  const fromName = process.env.MAILJET_FROM_NAME || "Flowboard";

  if (!apiKey || !secretKey || !from) {
    throw new Error(
      "Missing MAILJET_API_KEY, MAILJET_SECRET_KEY, or MAILJET_FROM (or EMAIL_FROM) in backend/.env"
    );
  }

  const body = JSON.stringify({
    Messages: [
      {
        From: { Email: from, Name: fromName },
        To: [{ Email: to }],
        Subject: subject,
        TextPart: text,
      },
    ],
  });

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: "api.mailjet.com",
        path: "/v3.1/send",
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }

          const payload = Buffer.concat(chunks).toString("utf8");
          reject(
            new Error(
              `Mailjet error ${res.statusCode || "unknown"}: ${payload}`
            )
          );
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendCodeEmail({ to, code, subject, textBuilder, logLabel }) {
  if (!to || !code) return;

  const normalizedTo = String(to).trim();
  const normalizedCode = String(code).trim();
  if (!normalizedTo || !normalizedCode) return;

  const messageText = textBuilder(normalizedCode);
  if (!messageText) return;

  if (shouldSendEmail()) {
    await sendMailjetEmail({
      to: normalizedTo,
      subject,
      text: messageText,
    });
    return;
  }

  console.info(`${logLabel} verification code generated for ${normalizedTo}`);
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

  const messageText = [
    "Use the link below to reset your password.",
    "",
    normalizedResetUrl,
    "",
    "This link expires in 15 minutes and can be used only once.",
  ].join("\n");

  if (shouldSendEmail()) {
    await sendMailjetEmail({
      to: normalizedTo,
      subject: "Reset your password",
      text: messageText,
    });
    return;
  }

  console.info(`Password reset link generated for ${normalizedTo}`);
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
