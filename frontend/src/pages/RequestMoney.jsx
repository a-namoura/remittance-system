import { useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "../services/authApi.js";
import { getAuthToken, readWalletState, writeWalletState } from "../services/session.js";
import { copyText, getQrImageUrl } from "../utils/paylink.js";

import { getUserErrorMessage } from "../utils/userError.js";
function buildRequestLink({ walletAddress, amountEth, note, username }) {
  const params = new URLSearchParams();
  params.set("request", "1");
  params.set("to", walletAddress);
  params.set("amount", amountEth);

  const normalizedNote = String(note || "").trim();
  if (normalizedNote) params.set("note", normalizedNote);

  const normalizedUsername = String(username || "").trim();
  if (normalizedUsername) params.set("from", normalizedUsername);

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

  return `${origin}/send?${params.toString()}`;
}

export default function RequestMoney() {
  const [me, setMe] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [linkAmount, setLinkAmount] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadCurrentUser() {
      const token = getAuthToken();
      if (!token) {
        if (!isCancelled) {
          setPageError("You must be logged in.");
          setPageLoading(false);
        }
        return;
      }

      try {
        setPageError("");
        const meResponse = await getCurrentUser({ token });
        if (isCancelled) return;
        setMe(meResponse || null);
      } catch (err) {
        if (isCancelled) return;
        setPageError(getUserErrorMessage(err, "Failed to load request page."));
      } finally {
        if (!isCancelled) {
          setPageLoading(false);
        }
      }
    }

    loadCurrentUser();

    return () => {
      isCancelled = true;
    };
  }, []);

  const walletState = useMemo(() => {
    if (me?.wallet?.linked && me?.wallet?.address) {
      return { linked: true, address: me.wallet.address };
    }
    if (!me?.id) return { linked: false, address: "" };
    return readWalletState(me.id) || { linked: false, address: "" };
  }, [me]);

  useEffect(() => {
    if (!me?.id || !me?.wallet?.linked || !me?.wallet?.address) return;
    writeWalletState(me.id, me.wallet.address);
  }, [me]);

  const canGenerateLink = walletState?.linked && walletState?.address;

  function handleGenerateLink() {
    const amount = Number(linkAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setLinkError("Request amount must be a positive number.");
      setGeneratedLink("");
      return;
    }

    if (!canGenerateLink) {
      setLinkError("Link your wallet first to generate request links.");
      setGeneratedLink("");
      return;
    }

    setLinkError("");
    setLinkCopied(false);

    const link = buildRequestLink({
      walletAddress: walletState.address,
      amountEth: String(amount),
      note: linkNote,
      username: me?.username || "",
    });

    setGeneratedLink(link);
  }

  async function handleCopyLink() {
    if (!generatedLink) return;
    const didCopy = await copyText(generatedLink);
    if (didCopy) {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1400);
      return;
    }
    window.prompt("Copy this request link:", generatedLink);
  }

  async function handleShareLink() {
    if (!generatedLink) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Money request",
          text: "Open this link to send payment.",
          url: generatedLink,
        });
        return;
      } catch {
        // fallback below
      }
    }
    await handleCopyLink();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <section className="rounded-[2.2rem] border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900">
          Request money
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Generate a secure request link and share it with the sender.
        </p>

        {pageError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        {!pageLoading && !pageError && !canGenerateLink && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Link your wallet in Account before generating request links.
          </div>
        )}

        {linkError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {linkError}
          </div>
        )}

        <section className="mt-6 rounded-3xl border border-gray-200 bg-gray-50 p-5">
          <h2 className="text-lg font-semibold text-gray-900">Generate request link</h2>
          <p className="mt-1 text-sm text-gray-600">
            The payer opens this link and sends funds to your linked wallet.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Amount (required)
              </label>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={linkAmount}
                onChange={(event) => setLinkAmount(event.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Note (optional)
              </label>
              <input
                type="text"
                value={linkNote}
                onChange={(event) => setLinkNote(event.target.value)}
                placeholder="Rent, split bill..."
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-400 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerateLink}
            className="mt-4 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
          >
            Generate link
          </button>

          {generatedLink && (
            <div className="mt-4 space-y-3 rounded-2xl border border-gray-200 bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  readOnly
                  value={generatedLink}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {linkCopied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={handleShareLink}
                  className="rounded-xl bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700"
                >
                  Share
                </button>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="mx-auto w-fit rounded-xl border border-white bg-white p-2 shadow-sm">
                  <img
                    src={getQrImageUrl(generatedLink)}
                    alt="QR code for request link"
                    className="h-40 w-40"
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
