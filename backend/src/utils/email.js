import https from "node:https";

async function sendSendGridEmail({ to, code }) {
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
    subject: "Your login verification code",
    content: [
      {
        type: "text/plain",
        value: `Your login verification code is ${code}.`,
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

export async function sendLoginCodeEmail({ to, code }) {
  if (!to || !code) return;

  const normalizedTo = String(to).trim();
  const normalizedCode = String(code).trim();
  if (!normalizedTo || !normalizedCode) return;

  if (process.env.NODE_ENV === "production") {
    await sendSendGridEmail({ to: normalizedTo, code: normalizedCode });
    return;
  }

  console.log(`Login verification code for ${normalizedTo}: ${normalizedCode}`);
}
