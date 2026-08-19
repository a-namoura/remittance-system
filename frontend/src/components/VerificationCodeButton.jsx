export default function VerificationCodeButton({
  busy = false,
  cooldown = 0,
  disabled = false,
  hasSent = false,
  className = "",
  ...buttonProps
}) {
  const isCoolingDown = hasSent && cooldown > 0;
  const label = busy
    ? "Sending code..."
    : isCoolingDown
      ? `Resend code in ${cooldown}s`
      : hasSent
        ? "Resend code"
        : "Send code";

  return (
    <button
      type="button"
      {...buttonProps}
      disabled={disabled || busy || isCoolingDown}
      className={className}
    >
      {label}
    </button>
  );
}
