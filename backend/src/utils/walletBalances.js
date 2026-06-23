import { getEthBalance } from "../blockchain/remittanceClient.js";
import { Wallet } from "../models/Wallet.js";
import { getNativeAssetSymbol } from "./currency.js";
import { normalizeEvmAddress } from "./walletAddress.js";

const MAX_BALANCE_SYNC_ERROR_LENGTH = 1000;

function normalizeBalanceSyncError(err) {
  return String(err?.shortMessage || err?.reason || err?.message || err || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BALANCE_SYNC_ERROR_LENGTH);
}

function asDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

export async function updateStoredWalletBalance(
  address,
  nativeBalance,
  { syncedAt = new Date() } = {}
) {
  const normalizedAddress = normalizeEvmAddress(address);
  const balance = Number(nativeBalance);

  if (!normalizedAddress || !Number.isFinite(balance) || balance < 0) {
    return null;
  }

  return Wallet.findOneAndUpdate(
    { address: normalizedAddress },
    {
      $set: {
        nativeBalance: balance,
        nativeBalanceSymbol: getNativeAssetSymbol(),
        nativeBalanceUpdatedAt: asDate(syncedAt),
      },
      $unset: { balanceSyncError: "" },
    },
    { new: true, runValidators: true }
  );
}

export async function refreshWalletBalance(
  address,
  { syncedAt = new Date(), throwOnError = false } = {}
) {
  const normalizedAddress = normalizeEvmAddress(address);
  if (!normalizedAddress) {
    const err = new Error("Wallet balance refresh requires a valid address.");
    if (throwOnError) throw err;
    return { address: null, updated: false, error: err.message };
  }

  try {
    const nativeBalance = await getEthBalance(normalizedAddress);
    const wallet = await updateStoredWalletBalance(normalizedAddress, nativeBalance, {
      syncedAt,
    });

    return {
      address: normalizedAddress,
      balance: nativeBalance,
      updated: Boolean(wallet),
      wallet,
    };
  } catch (err) {
    const error = normalizeBalanceSyncError(err) || "Wallet balance sync failed.";
    await Wallet.updateOne(
      { address: normalizedAddress },
      { $set: { balanceSyncError: error } }
    ).catch(() => {});

    if (throwOnError) throw err;
    return { address: normalizedAddress, updated: false, error };
  }
}

export async function refreshTransactionWalletBalances(
  transaction,
  { syncedAt = new Date() } = {}
) {
  if (!transaction || transaction.status !== "success") return [];

  const addresses = [
    ...new Set(
      [transaction.senderWallet, transaction.receiverWallet]
        .map((address) => normalizeEvmAddress(address))
        .filter(Boolean)
    ),
  ];

  return Promise.all(
    addresses.map((address) => refreshWalletBalance(address, { syncedAt }))
  );
}
