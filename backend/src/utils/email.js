import https from "node:https";

async function sendSendGridEmail({ to, subject, text }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM || process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error(
      "Missing SENDGRID_API_KEY or SENDGRID_FROM (or EMAIL_FROM) in backend/.env"
    );
  }

  const body = JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from },
    subject,
    content: [
      {
        type: "text/plain",
        value: text,
      },
    ],
  });

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: "api.sendgrid.com",
        path: "/v3/mail/send",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
              `SendGrid error ${res.statusCode || "unknown"}: ${payload}`
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

  if (process.env.NODE_ENV === "production") {
    await sendSendGridEmail({
      to: normalizedTo,
      subject,
      text: messageText,
    });
    return;
  }

  console.log(`${logLabel} verification code for ${normalizedTo}: ${normalizedCode}`);
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

export async function sendPaymentCodeEmail({ to, code }) {
  await sendCodeEmail({
    to,
    code,
    subject: "Your payment verification code",
    textBuilder: (normalizedCode) => `Your payment verification code is ${normalizedCode}.`,
    logLabel: "Payment",
  });
}
