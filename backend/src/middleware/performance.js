const DEFAULT_API_RESPONSE_SLA_MS = 2000;

export function getApiResponseSlaMs() {
  const configuredValue = Number(process.env.API_RESPONSE_SLA_MS);
  if (!Number.isFinite(configuredValue) || configuredValue <= 0) {
    return DEFAULT_API_RESPONSE_SLA_MS;
  }

  return Math.floor(configuredValue);
}

export function responseSlaMonitor(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const slaMs = getApiResponseSlaMs();

  res.setHeader("X-Response-Sla-Ms", String(slaMs));

  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (elapsedMs <= slaMs) return;

    console.warn(
      `API response SLA exceeded: ${req.method} ${req.originalUrl} ${Math.round(
        elapsedMs
      )}ms (target ${slaMs}ms)`
    );
  });

  next();
}
