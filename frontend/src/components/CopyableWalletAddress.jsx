import { useState } from "react";
import { CopyIcon } from "./ActionIcons.jsx";

export default function CopyableWalletAddress({ address, label = "Wallet", className = "" }) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(address));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Wallet address copied" : "Copy wallet address"}
      aria-label={copied ? "Wallet address copied" : "Copy wallet address"}
      className={`group flex w-full items-center gap-2 rounded-lg text-left font-mono transition hover:bg-purple-50 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-300 ${className}`}
    >
      <span className="min-w-0 flex-1 break-all">
        {label ? <span className="font-sans font-medium">{label}: </span> : null}
        {address}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-sans text-[11px] text-purple-600">
        <CopyIcon className="h-4 w-4" />
        {copied ? <span>Copied</span> : null}
      </span>
    </button>
  );
}
