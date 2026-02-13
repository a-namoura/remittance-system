export function friendSearchSource(friend) {
  return [friend.label, friend.username, friend.walletAddress]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function shortWallet(address) {
  if (!address) return "";
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

export function buildPayLink({ mode, currentUser, friend, amount, note }) {
  const params = new URLSearchParams();
  params.set("mode", mode);

  if (currentUser) {
    params.set("user", currentUser);
  }

  if (friend?.username) {
    params.set("friend", friend.username);
  }

  if (friend?.walletAddress) {
    params.set("wallet", friend.walletAddress);
  }

  if (amount) {
    params.set("amount", amount);
  }

  if (note) {
    params.set("note", note);
  }

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

  return `${origin}/paylink?${params.toString()}`;
}

export function getQrImageUrl(link) {
  if (!link) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(
    link
  )}`;
}

export function isValidOptionalPositiveAmount(amount) {
  if (!amount) return true;
  const value = Number(amount);
  return Number.isFinite(value) && value > 0;
}

export async function copyText(value) {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
