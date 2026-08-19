import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  PageContainer,
  PageError,
  PageHeader,
  PageLoading,
  PageNotice,
} from "../components/PageLayout.jsx";
import SuccessTransition from "../components/SuccessTransition.jsx";
import { getCurrentUser } from "../services/authApi.js";
import {
  claimTransferLink,
  pollTransactionUntilSettled,
  resolveTransferLink,
} from "../services/transactionApi.js";
import { getAuthToken, requireAuthToken } from "../services/session.js";
import { useTransitionNotification } from "../utils/successTransition.js";
import { displayCurrency } from "../utils/currency.js";
import { isValidEvmAddress } from "../utils/security.js";

import { getUserErrorMessage } from "../utils/userError.js";
export default function ClaimTransfer() {
  const [searchParams] = useSearchParams();
  const token = String(
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token")
      : "") || searchParams.get("token") || ""
  ).trim();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const [claimSuccess, setClaimSuccess] = useState("");
  const [transactionNotification, showTransactionNotification] =
    useTransitionNotification();
  const [currentUser, setCurrentUser] = useState(null);
  const pendingPollRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadCurrentUser() {
      const authToken = getAuthToken();
      if (!authToken) {
        setCurrentUser(null);
        return;
      }

      try {
        const user = await getCurrentUser({ token: authToken });
        if (!isCancelled) {
          setCurrentUser(user || null);
        }
      } catch {
        if (!isCancelled) {
          setCurrentUser(null);
        }
      }
    }

    async function loadPreview() {
      if (!token) {
        setStatus("invalid");
        setError("Transfer token is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const data = await resolveTransferLink({ token });
        if (isCancelled) return;

        setStatus(data.status || "invalid");
        setPreview(data);
      } catch (err) {
        if (isCancelled) return;
        setStatus("invalid");
        setError(getUserErrorMessage(err, "Unable to load transfer link."));
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadCurrentUser();
    loadPreview();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  useEffect(() => {
    return () => {
      pendingPollRef.current?.abort();
    };
  }, []);

  function notifyTerminalTransaction(transaction) {
    const status = String(transaction?.status || "").trim().toLowerCase();
    const txHash = transaction?.txHash ? ` Tx: ${transaction.txHash}` : "";

    if (status === "failed") {
      const message = transaction?.failureReason || "Transaction failed.";
      setError(message);
      setClaimSuccess("");
      showTransactionNotification(message, { variant: "error" });
      return;
    }

    if (status === "success") {
      const message = `Transfer claim confirmed.${txHash}`;
      setClaimSuccess(message);
      setStatus("claimed");
      showTransactionNotification(message, { variant: "success" });
    }
  }

  async function watchPendingTransaction({ authToken, transaction }) {
    const transactionId = transaction?.id;
    if (!transactionId) return;

    pendingPollRef.current?.abort();
    const controller = new AbortController();
    pendingPollRef.current = controller;

    setPendingTransaction(transaction);
    setClaimSuccess("Transfer claim submitted. Waiting for confirmation...");

    try {
      const settledTransaction = await pollTransactionUntilSettled({
        token: authToken,
        id: transactionId,
        signal: controller.signal,
        onUpdate: (updatedTransaction) => {
          if (updatedTransaction) {
            setPendingTransaction(updatedTransaction);
          }
        },
      });

      if (controller.signal.aborted || !settledTransaction) return;
      setPendingTransaction(null);
      notifyTerminalTransaction(settledTransaction);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        getUserErrorMessage(
          err,
          "Transfer claim is still pending. We could not refresh its status."
        )
      );
    } finally {
      if (pendingPollRef.current === controller) {
        pendingPollRef.current = null;
      }
    }
  }

  async function handleClaim() {
    const receiverWallet = String(currentUser?.wallet?.address || "").trim();
    const amount = Number(preview?.amount);
    if (status !== "active") {
      setError("This transfer cannot be claimed.");
      return;
    }
    if (!isValidEvmAddress(receiverWallet)) {
      setError("Link a valid wallet before claiming this transfer.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("This transfer does not have a valid amount.");
      return;
    }

    const authToken = requireAuthToken({
      message: "Please login before claiming this transfer.",
      onMissing: (message) => setError(message),
    });
    if (!authToken) {
      return;
    }

    try {
      setClaiming(true);
      setError("");
      setClaimSuccess("");

      const result = await claimTransferLink({ token, authToken });
      const txHash = result?.transaction?.txHash || null;
      const txStatus = String(result?.transaction?.status || "").trim().toLowerCase();

      setClaimSuccess(
        txHash
          ? `Transfer claim submitted. Tx: ${txHash}`
          : "Transfer claim submitted. Confirmation is processing."
      );
      setStatus(result?.status || "claiming");
      if (txStatus === "pending") {
        watchPendingTransaction({ authToken, transaction: result?.transaction });
      } else {
        notifyTerminalTransaction(result?.transaction);
      }
    } catch (err) {
      const message = getUserErrorMessage(err, "Failed to claim transfer.");
      setError(message);
      showTransactionNotification(message, { variant: "error" });
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <PageContainer className="max-w-xl pt-16">
        <PageLoading className="text-sm">Loading transfer...</PageLoading>
      </PageContainer>
    );
  }

  const receiverWallet = String(currentUser?.wallet?.address || "").trim();
  const claimAmount = Number(preview?.amount);
  const canClaimTransfer = Boolean(
    status === "active" &&
      isValidEvmAddress(receiverWallet) &&
      Number.isFinite(claimAmount) &&
      claimAmount > 0 &&
      !claiming
  );

  return (
    <>
      <SuccessTransition
        message={transactionNotification.message}
        variant={transactionNotification.variant}
      />

      <PageContainer stack className="max-w-xl pt-16">
      <PageHeader
        title="Claim transfer"
        description="Review the transfer details and claim funds into your account."
      />

      <section className="space-y-4 rounded-2xl border bg-white p-6">
        <PageError>{error}</PageError>

        <PageNotice variant="success">{claimSuccess}</PageNotice>

        {pendingTransaction ? (
          <PageLoading className="text-sm">
            Transaction pending. Waiting for confirmation...
          </PageLoading>
        ) : null}

        {status === "invalid" && (
          <p className="text-sm text-gray-700">
            This transfer link is invalid.
          </p>
        )}

        {status === "expired" && (
          <p className="text-sm text-gray-700">
            This transfer link has expired.
          </p>
        )}

        {status === "claimed" && !claimSuccess && (
          <p className="text-sm text-gray-700">
            This transfer has already been claimed.
          </p>
        )}

        {status === "claiming" && !claimSuccess && (
          <p className="text-sm text-gray-700">
            This transfer is being claimed. Confirmation is processing.
          </p>
        )}

        {status === "active" && (
          <>
            <div className="space-y-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Transaction summary
              </p>
              <p className="mt-3 text-xs uppercase tracking-wide text-gray-500">
                Receiver
              </p>
              <p className="break-all font-mono text-sm text-gray-900">
                {receiverWallet || "Your linked wallet after login"}
              </p>
              <p className="mt-3 text-xs uppercase tracking-wide text-gray-500">
                Total amount
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {preview?.amount}{" "}
                {displayCurrency(preview?.assetSymbol)}
              </p>
              {preview?.note && (
                <p className="text-sm text-gray-600">Note: {preview.note}</p>
              )}
              {preview?.creator?.displayName && (
                <p className="text-sm text-gray-600">
                  From: {preview.creator.displayName}
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                to="/dashboard"
                className="rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel transfer
              </Link>
              <button
                type="button"
                onClick={handleClaim}
                disabled={!canClaimTransfer}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {claiming ? "Claiming..." : "Confirm and claim"}
              </button>
            </div>
            {!isValidEvmAddress(receiverWallet) ? (
              <p className="text-xs font-medium text-red-600">
                Link a valid wallet before claiming this transfer.
              </p>
            ) : !Number.isFinite(claimAmount) || claimAmount <= 0 ? (
              <p className="text-xs font-medium text-red-600">
                This transfer does not have a valid amount.
              </p>
            ) : null}
          </>
        )}

        {status !== "active" && (
          <div className="pt-2">
            <Link to="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
              Back to dashboard
            </Link>
          </div>
        )}
      </section>
      </PageContainer>
    </>
  );
}
