export default function WalletApprovalStatus({
  visible,
  providerName = "wallet provider",
  className = "",
}) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-700 border-r-transparent"
      />
      <div>
        <p className="text-sm font-semibold">Check your {providerName}</p>
        <p className="mt-0.5 text-xs text-amber-800">
          Approve the transaction to continue. This app will update automatically after you confirm.
        </p>
      </div>
    </div>
  );
}
