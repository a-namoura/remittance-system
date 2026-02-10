import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../components/BackButton.jsx";
import { apiRequest } from "../services/api.js";
import {
  createBeneficiary,
  listBeneficiaries,
} from "../services/beneficiaryApi.js";
import { getCurrentUser } from "../services/authApi.js";
import {
  clearLegacyWalletAddress,
  getAuthToken,
  getLegacyWalletAddress,
  readWalletState,
  writeWalletState,
} from "../services/session.js";
import { isValidEvmAddress } from "../utils/security.js";

const MAX_BENEFICIARY_LABEL_LENGTH = 80;
const MAX_BENEFICIARY_USERNAME_LENGTH = 40;
const MAX_BENEFICIARY_NOTES_LENGTH = 280;

async function fetchWalletBalance({ token, walletAddress }) {
  const query = new URLSearchParams({ wallet: walletAddress });
  const result = await apiRequest(`/api/transactions/balance?${query.toString()}`, {
    token,
  });
  return typeof result.balance === "number" ? result.balance : null;
}

export default function SendMoney() {
  const navigate = useNavigate();

  const [receiverWallet, setReceiverWallet] = useState("");
  const [amountEth, setAmountEth] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");

  const [walletAddress, setWalletAddress] = useState("");
  const [availableBalance, setAvailableBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  const [confirmData, setConfirmData] = useState(null);

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState("");
  const [beneficiaryError, setBeneficiaryError] = useState("");
  const [beneficiaryLoading, setBeneficiaryLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLabel, setModalLabel] = useState("");
  const [modalUsername, setModalUsername] = useState("");
  const [modalWallet, setModalWallet] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadPageData() {
      const token = getAuthToken();
      if (!token) {
        if (!isCancelled) {
          setSendError("You must be logged in.");
        }
        return;
      }

      try {
        setBeneficiaryLoading(true);
        setBalanceLoading(true);
        setBeneficiaryError("");
        setBalanceError("");

        const [beneficiaryData, user] = await Promise.all([
          listBeneficiaries({ token }),
          getCurrentUser({ token }),
        ]);

        if (isCancelled) return;

        setBeneficiaries(beneficiaryData.beneficiaries || []);

        let storedAddress = "";
        if (user?.id) {
          storedAddress = readWalletState(user.id).address || "";
        }

        if (!storedAddress) {
          const legacyAddress = getLegacyWalletAddress();
          if (legacyAddress) {
            storedAddress = legacyAddress;
            if (user?.id) {
              writeWalletState(user.id, legacyAddress);
            }
            clearLegacyWalletAddress();
          }
        }

        setWalletAddress(storedAddress);

        if (!storedAddress) {
          setAvailableBalance(null);
          setBalanceError(
            "You must link your wallet on the dashboard before sending."
          );
          return;
        }

        const balance = await fetchWalletBalance({
          token,
          walletAddress: storedAddress,
        });

        if (isCancelled) return;
        setAvailableBalance(balance);
      } catch (err) {
        if (isCancelled) return;
        const message = err.message || "Failed to load send money page data.";
        setBeneficiaryError(message);
        setBalanceError(message);
      } finally {
        if (!isCancelled) {
          setBeneficiaryLoading(false);
          setBalanceLoading(false);
        }
      }
    }

    loadPageData();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function refreshBalance() {
    const token = getAuthToken();
    if (!token || !walletAddress) return;

    try {
      setBalanceLoading(true);
      setBalanceError("");

      const balance = await fetchWalletBalance({ token, walletAddress });
      setAvailableBalance(balance);
    } catch (err) {
      setBalanceError(err.message || "Failed to load wallet balance.");
      setAvailableBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }

  function handleSelectBeneficiary(event) {
    const selectedId = event.target.value;
    setSelectedBeneficiaryId(selectedId);

    const selected = beneficiaries.find(
      (beneficiary) => String(beneficiary.id) === String(selectedId)
    );
    if (selected?.walletAddress) {
      setReceiverWallet(selected.walletAddress);
    }
  }

  function openModal() {
    setModalLabel("");
    setModalUsername("");
    setModalWallet("");
    setModalNotes("");
    setModalError("");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setModalSaving(false);
    setModalError("");
  }

  async function handleSaveBeneficiary(event) {
    event.preventDefault();
    setModalError("");

    const label = modalLabel.trim();
    const username = modalUsername.trim();
    const wallet = modalWallet.trim();
    const notes = modalNotes.trim();

    if (!label) {
      setModalError("Name is required for the beneficiary.");
      return;
    }

    if (!username && !wallet) {
      setModalError("Provide at least a username or a wallet address.");
      return;
    }

    if (wallet && !isValidEvmAddress(wallet)) {
      setModalError("Please provide a valid EVM wallet address.");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setModalError("You must be logged in.");
      return;
    }

    try {
      setModalSaving(true);

      const response = await createBeneficiary({
        token,
        label,
        username: username || undefined,
        walletAddress: wallet || undefined,
        notes: notes || undefined,
      });

      const created = response.beneficiary;
      setBeneficiaries((prev) => [created, ...prev]);
      setSelectedBeneficiaryId(String(created.id));

      if (created.walletAddress) {
        setReceiverWallet(created.walletAddress);
      }

      closeModal();
    } catch (err) {
      setModalError(err.message || "Failed to save beneficiary.");
    } finally {
      setModalSaving(false);
    }
  }

  function handlePrepareSend(event) {
    event.preventDefault();
    setSendError("");
    setSendSuccess("");

    const normalizedReceiver = receiverWallet.trim();
    if (!normalizedReceiver || !amountEth) {
      setSendError("Receiver wallet and amount are required.");
      return;
    }

    if (!isValidEvmAddress(normalizedReceiver)) {
      setSendError("Receiver wallet must be a valid EVM address.");
      return;
    }

    if (
      walletAddress &&
      normalizedReceiver.toLowerCase() === walletAddress.toLowerCase()
    ) {
      setSendError("Receiver wallet must be different from your linked wallet.");
      return;
    }

    const amountNumber = Number(amountEth);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setSendError("Amount must be a positive number.");
      return;
    }

    if (
      availableBalance != null &&
      Number.isFinite(availableBalance) &&
      amountNumber > availableBalance
    ) {
      setSendError(
        `Insufficient balance. Available: ${availableBalance.toFixed(4)} ETH.`
      );
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setSendError("You must be logged in.");
      return;
    }

    if (!walletAddress) {
      setSendError(
        "You must link your wallet on the dashboard before sending a transaction."
      );
      return;
    }

    setConfirmData({
      receiverWallet: normalizedReceiver,
      amountEth: amountNumber,
    });
  }

  async function handleConfirmSend() {
    if (!confirmData) return;

    const token = getAuthToken();
    if (!token) {
      setSendError("You must be logged in.");
      setConfirmData(null);
      return;
    }

    try {
      setSending(true);
      setSendError("");

      const result = await apiRequest("/api/transactions/send", {
        method: "POST",
        token,
        body: {
          receiverWallet: confirmData.receiverWallet,
          amountEth: confirmData.amountEth,
        },
      });

      setSendSuccess(
        `Transaction created with status "${result.transaction.status}".`
      );
      setAmountEth("");
      setConfirmData(null);

      await refreshBalance();
    } catch (err) {
      setSendError(err.message || "Failed to send transaction.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="mb-4">
        <BackButton fallback="/dashboard" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Send Money</h1>
        <p className="text-sm text-gray-600 mt-1">
          Send a transaction to a receiver wallet using your linked on-chain
          balance. You can choose a saved beneficiary or add a new one.
        </p>
      </div>

      {sendError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {sendError}
        </div>
      )}

      {sendSuccess && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          {sendSuccess}
        </div>
      )}

      <form
        onSubmit={handlePrepareSend}
        className="rounded-2xl border bg-white p-6 space-y-6"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              Saved beneficiary
            </label>
            <button
              type="button"
              onClick={openModal}
              className="text-xs text-blue-600 hover:underline"
            >
              Add new beneficiary
            </button>
          </div>

          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={selectedBeneficiaryId}
            onChange={handleSelectBeneficiary}
            disabled={beneficiaryLoading || beneficiaries.length === 0}
          >
            <option value="">
              {beneficiaries.length === 0
                ? "No beneficiaries saved yet"
                : "Select a saved beneficiary"}
            </option>
            {beneficiaries.map((beneficiary) => (
              <option key={beneficiary.id} value={beneficiary.id}>
                {beneficiary.label}
                {beneficiary.username ? ` - ${beneficiary.username}` : ""}
                {" "}
                {beneficiary.walletAddress
                  ? `(${beneficiary.walletAddress.slice(0, 8)}...)`
                  : "(no wallet)"}
              </option>
            ))}
          </select>

          {beneficiaryError && (
            <div className="mt-1 text-xs text-red-600">{beneficiaryError}</div>
          )}
        </div>

        <div className="space-y-4 pt-4 border-t">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Receiver wallet address
            </label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm font-mono"
              placeholder="0x..."
              value={receiverWallet}
              maxLength={42}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) => setReceiverWallet(event.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              This should be an EVM-compatible address on the configured
              network.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (ETH)
            </label>
            <input
              type="number"
              step="0.0001"
              min="0"
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="0.0000"
              value={amountEth}
              onChange={(event) => setAmountEth(event.target.value)}
            />

            {balanceLoading && (
              <p className="mt-1 text-xs text-gray-500">
                Loading on-chain balance...
              </p>
            )}

            {!balanceLoading && availableBalance != null && (
              <p className="mt-1 text-xs text-gray-600">
                Available:{" "}
                <span className="font-mono">
                  {availableBalance.toFixed(4)} ETH
                </span>
              </p>
            )}

            {balanceError && (
              <p className="mt-1 text-xs text-red-600">{balanceError}</p>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              You must have a linked wallet with sufficient balance to complete
              this transaction.
            </span>
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => navigate("/dashboard")}
            >
              Check balance on dashboard
            </button>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={sending}
              className="w-full inline-flex items-center justify-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send transaction"}
            </button>
          </div>
        </div>
      </form>

      {confirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Confirm transaction
              </h2>
              <button
                type="button"
                onClick={() => setConfirmData(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
                aria-label="Close confirmation"
              >
                X
              </button>
            </div>

            <p className="text-sm text-gray-700">
              You are about to send{" "}
              <span className="font-mono font-semibold">
                {confirmData.amountEth} ETH
              </span>{" "}
              to:
            </p>

            <p className="text-xs font-mono break-all bg-gray-50 border rounded px-3 py-2">
              {confirmData.receiverWallet}
            </p>

            {availableBalance != null && (
              <p className="text-xs text-gray-600">
                Available balance:{" "}
                <span className="font-mono">
                  {availableBalance.toFixed(4)} ETH
                </span>
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmData(null)}
                className="px-3 py-1.5 rounded-md border text-xs text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                disabled={sending}
                className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {sending ? "Sending..." : "Confirm & send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Add new beneficiary
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-sm"
                aria-label="Close beneficiary modal"
              >
                X
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Give this beneficiary a name, and optionally store their username
              and wallet. At least a username or a wallet is required.
            </p>

            {modalError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveBeneficiary} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Name (how you will see this beneficiary)
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="Example: Max"
                  value={modalLabel}
                  maxLength={MAX_BENEFICIARY_LABEL_LENGTH}
                  onChange={(event) => setModalLabel(event.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="username"
                  value={modalUsername}
                  maxLength={MAX_BENEFICIARY_USERNAME_LENGTH}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setModalUsername(event.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Wallet address
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                  placeholder="0x..."
                  value={modalWallet}
                  maxLength={42}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setModalWallet(event.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Relationship, country, purpose..."
                  value={modalNotes}
                  maxLength={MAX_BENEFICIARY_NOTES_LENGTH}
                  onChange={(event) => setModalNotes(event.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3 py-1.5 rounded-md border text-xs text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  {modalSaving ? "Saving..." : "Save beneficiary"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
