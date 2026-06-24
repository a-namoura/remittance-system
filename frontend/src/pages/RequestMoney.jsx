import { useEffect, useMemo, useState } from "react";
import {
  FieldError,
  PageContainer,
  PageError,
  PageHeader,
} from "../components/PageLayout.jsx";
import SuccessTransition from "../components/SuccessTransition.jsx";
import { getCurrentUser } from "../services/authApi.js";
import { readWalletState, requireAuthToken, writeWalletState } from "../services/session.js";
import {
  FORM_FIELD_LABEL_CLASS,
  FORM_INLINE_PRIMARY_BUTTON_CLASS,
  FORM_INLINE_SECONDARY_BUTTON_CLASS,
  FORM_INPUT_BASE_CLASS,
  FORM_READONLY_INPUT_CLASS,
} from "../styles/formClasses.js";
import { copyText, getQrImageUrl } from "../utils/paylink.js";
import { useSuccessTransitionMessage } from "../utils/successTransition.js";

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
  const [fieldErrors, setFieldErrors] = useState({ amount: "" });
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkSuccessMessage, showLinkSuccess] = useSuccessTransitionMessage();

  useEffect(() => {
    let isCancelled = false;

    async function loadCurrentUser() {
      const token = requireAuthToken({
        onMissing: () => {
          if (!isCancelled) {
            setPageError("You must be logged in.");
            setPageLoading(false);
          }
        },
      });
      if (!token) {
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
  const requestAmountValue = Number(linkAmount);
  const hasPositiveRequestAmount =
    Number.isFinite(requestAmountValue) && requestAmountValue > 0;
  const canSubmitRequestLink = Boolean(canGenerateLink && hasPositiveRequestAmount);

  function handleGenerateLink() {
    const amount = requestAmountValue;
    const nextFieldErrors = { amount: "" };
    if (!Number.isFinite(amount) || amount <= 0) {
      nextFieldErrors.amount = "Request amount must be a positive number.";
      setFieldErrors(nextFieldErrors);
      setLinkError("");
      setGeneratedLink("");
      return;
    }

    setFieldErrors(nextFieldErrors);
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
    showLinkSuccess("Link created");
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
    <>
      <SuccessTransition message={linkSuccessMessage} />

      <PageContainer stack>
      <PageHeader
        title="Request money"
        description="Generate a secure request link and share it with the sender."
      />

      <section className="rounded-[2.2rem] border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
        <PageError className="mt-4">{pageError}</PageError>

        {!pageLoading && !pageError && !canGenerateLink ? (
          <PageError className="mt-4">
            Link your wallet in Account before generating request links.
          </PageError>
        ) : null}

        <PageError className="mt-4">{linkError}</PageError>

        <section className="mt-4 rounded-3xl border border-gray-200 bg-gray-50 p-5">
          <h2 className="text-lg font-semibold text-gray-900">Generate request link</h2>
          <p className="mt-1 text-sm text-gray-600">
            The payer opens this link and sends funds to your linked wallet.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={FORM_FIELD_LABEL_CLASS}>
                Amount (required)
              </label>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={linkAmount}
                onChange={(event) => {
                  setLinkAmount(event.target.value);
                  setFieldErrors((current) => ({ ...current, amount: "" }));
                }}
                placeholder="0.00"
                className={FORM_INPUT_BASE_CLASS}
              />
              <FieldError>{fieldErrors.amount}</FieldError>
            </div>
            <div>
              <label className={FORM_FIELD_LABEL_CLASS}>
                Note (optional)
              </label>
              <input
                type="text"
                value={linkNote}
                onChange={(event) => setLinkNote(event.target.value)}
                placeholder="Rent, split bill..."
                className={FORM_INPUT_BASE_CLASS}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerateLink}
            disabled={!canSubmitRequestLink}
            className={`mt-4 ${FORM_INLINE_PRIMARY_BUTTON_CLASS}`}
          >
            Generate link
          </button>

          {generatedLink && (
            <div className="mt-4 space-y-3 rounded-2xl border border-gray-200 bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <label htmlFor="request-generated-link" className={FORM_FIELD_LABEL_CLASS}>
                    Request link
                  </label>
                  <input
                    id="request-generated-link"
                    type="text"
                    readOnly
                    value={generatedLink}
                    className={`min-w-0 ${FORM_READONLY_INPUT_CLASS} text-xs`}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={FORM_INLINE_SECONDARY_BUTTON_CLASS}
                >
                  {linkCopied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={handleShareLink}
                  className={FORM_INLINE_PRIMARY_BUTTON_CLASS}
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
      </PageContainer>
    </>
  );
}
