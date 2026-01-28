import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackButton from "../components/BackButton.jsx";
import { apiRequest } from "../services/api.js";
import { listBeneficiaries, createBeneficiary } from "../services/beneficiaryApi.js";

export default function SendMoney() {
  const navigate = useNavigate();

  // Sending form
  const [receiverWallet, setReceiverWallet] = useState("");
  const [amountEth, setAmountEth] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");

  // Beneficiaries
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState("");
  const [beneficiaryError, setBeneficiaryError] = useState("");
  const [beneficiaryLoading, setBeneficiaryLoading] = useState(false);

  // Modal state for "Add new beneficiary"
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLabel, setModalLabel] = useState("");      // Name saved by the user
  const [modalUsername, setModalUsername] = useState(""); // Beneficiary username
  const [modalWallet, setModalWallet] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  // Load beneficiaries on mount
  useEffect(() => {
    async function loadBeneficiaries() {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        setBeneficiaryLoading(true);
        setBeneficiaryError("");

        const data = await listBeneficiaries({ token });
        setBeneficiaries(data.beneficiaries || []);
      } catch (err) {
        setBeneficiaryError(err.message || "Failed to load beneficiaries.");
      } finally {
        setBeneficiaryLoading(false);
      }
    }

    loadBeneficiaries();
  }, []);

  // When a beneficiary is selected, fill receiver wallet (if present)
  function handleSelectBeneficiary(e) {
    const id = e.target.value;
    setSelectedBeneficiaryId(id);

    const b = beneficiaries.find((x) => x.id === id);
    if (b && b.walletAddress) {
      setReceiverWallet(b.walletAddress);
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

  // Save beneficiary from modal
  async function handleSaveBeneficiary(e) {
    e.preventDefault();
    setModalError("");

    const label = modalLabel.trim();
    const username = modalUsername.trim();
    const wallet = modalWallet.trim();

    if (!label) {
      setModalError("Name is required for the beneficiary.");
      return;
    }

    // Enforce: at least username or wallet
    if (!username && !wallet) {
      setModalError("Provide at least a username or a wallet address.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setModalError("You must be logged in.");
      return;
    }

    try {
      setModalSaving(true);

      const res = await createBeneficiary({
        token,
        label,
        username: username || undefined,
        walletAddress: wallet || undefined,
        notes: modalNotes || undefined,
      });

      const created = res.beneficiary;

      setBeneficiaries((prev) => [created, ...prev]);
      setSelectedBeneficiaryId(created.id);

      // If the new beneficiary has a wallet, fill it into the send form
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

  async function handleSend(e) {
    e.preventDefault();
    setSendError("");
    setSendSuccess("");

    if (!receiverWallet || !amountEth) {
      setSendError("Receiver wallet and amount are required.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setSendError("You must be logged in.");
      return;
    }

    const amountNumber = Number(amountEth);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setSendError("Amount must be a positive number.");
      return;
    }

    try {
      setSending(true);

      const res = await apiRequest("/api/transactions/send", {
        method: "POST",
        token,
        body: {
          receiverWallet,
          amountEth: amountNumber,
        },
      });

      setSendSuccess(
        `Transaction created with status "${res.transaction.status}".`
      );
      setSendError("");
      setAmountEth("");
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

      {/* Status messages */}
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
        onSubmit={handleSend}
        className="rounded-2xl border bg-white p-6 space-y-6"
      >
        {/* Beneficiary Section */}
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
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}{" "}
                {b.username ? `– ${b.username}` : ""}{" "}
                {b.walletAddress
                  ? `(${b.walletAddress.slice(0, 8)}…)`
                  : "(no wallet)"}
              </option>
            ))}
          </select>

          {beneficiaryError && (
            <div className="mt-1 text-xs text-red-600">
              {beneficiaryError}
            </div>
          )}
        </div>

        {/* Actual send form */}
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
              onChange={(e) => setReceiverWallet(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              This should be an EVM-compatible address (e.g., MetaMask account)
              on the configured network.
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
              onChange={(e) => setAmountEth(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              You must have a linked wallet with sufficient testnet balance to
              complete this transaction.
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
              {sending ? "Sending…" : "Send transaction"}
            </button>
          </div>
        </div>
      </form>

      {/* Modal for adding new beneficiary */}
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
              >
                ✕
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
                  onChange={(e) => setModalLabel(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Username (optional)
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="username"
                  value={modalUsername}
                  onChange={(e) => setModalUsername(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Wallet address (optional)
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                  placeholder="0x..."
                  value={modalWallet}
                  onChange={(e) => setModalWallet(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Relationship, country, purpose…"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
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
                  {modalSaving ? "Saving…" : "Save beneficiary"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
