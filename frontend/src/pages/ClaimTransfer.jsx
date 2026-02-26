import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  PageContainer,
  PageError,
  PageHeader,
  PageLoading,
  PageNotice,
} from "../components/PageLayout.jsx";
import {
  claimTransferLink,
  resolveTransferLink,
} from "../services/transactionApi.js";
import { requireAuthToken } from "../services/session.js";

import { getUserErrorMessage } from "../utils/userError.js";
export default function ClaimTransfer() {
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState("");

  useEffect(() => {
    let isCancelled = false;

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

    loadPreview();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  async function handleClaim() {
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

      setClaimSuccess(
        txHash
          ? `Transfer claimed successfully. Tx: ${txHash}`
          : "Transfer claimed successfully."
      );
      setStatus("claimed");
    } catch (err) {
      setError(getUserErrorMessage(err, "Failed to claim transfer."));
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

  return (
    <PageContainer stack className="max-w-xl pt-16">
      <PageHeader
        title="Claim transfer"
        description="Review the transfer details and claim funds into your account."
      />

      <section className="space-y-4 rounded-2xl border bg-white p-6">
        <PageError>{error}</PageError>

        <PageNotice variant="success">{claimSuccess}</PageNotice>

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

        {status === "active" && (
          <>
            <div className="space-y-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Amount</p>
              <p className="text-lg font-semibold text-gray-900">
                {preview?.amount}{" "}
                {String(preview?.assetSymbol || "ETH").trim().toUpperCase() || "ETH"}
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

            <button
              type="button"
              onClick={handleClaim}
              disabled={claiming}
              className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {claiming ? "Claiming..." : "Claim now"}
            </button>
          </>
        )}

        <div className="pt-2">
          <Link to="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
