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
import { CopyIcon, ShareIcon } from "../components/ActionIcons.jsx";
import AmountInput from "../components/AmountInput.jsx";
import { createPaymentRequestLink, revokePaymentRequestLink } from "../services/transactionApi.js";
import { createPaymentCommitment, encryptRequestPayload } from "../utils/requestLinkCrypto.js";

import { getUserErrorMessage } from "../utils/userError.js";
function buildRequestLink(requestToken, encryptionKey) {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

  return `${origin}/send/${encodeURIComponent(requestToken)}#${encryptionKey}`;
}

export default function RequestMoney() {
  const [me, setMe] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [linkAmount, setLinkAmount] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [generatedRequestToken, setGeneratedRequestToken] = useState("");
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

  async function handleGenerateLink() {
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

    const token = requireAuthToken();
    if (!token) {
      setLinkError("You must be logged in.");
      return;
    }

    try {
      const payment = {
        walletAddress: walletState.address,
        amount: String(amount),
        assetSymbol: String(me?.wallet?.balanceSymbol || "BNB").toUpperCase(),
      };
      const { commitmentKey, paymentCommitment } = await createPaymentCommitment(payment);
      const { encryptedPayload, encryptionKey } = await encryptRequestPayload({
        ...payment,
        username: String(me?.username || ""),
        note: String(linkNote || "").trim(),
        commitmentKey,
      });
      const response = await createPaymentRequestLink({
        token,
        encryptedPayload,
        paymentCommitment,
        assetSymbol: String(me?.wallet?.balanceSymbol || "BNB").toUpperCase(),
      });
      const requestToken = String(response.requestToken || "").trim();
      if (!requestToken) throw new Error("Could not create request link.");
      setGeneratedLink(buildRequestLink(requestToken, encryptionKey));
      setGeneratedRequestToken(requestToken);
      showLinkSuccess("Link created");
    } catch (err) {
      setGeneratedLink("");
      setGeneratedRequestToken("");
      setLinkError(getUserErrorMessage(err, "Failed to generate request link."));
    }
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

  async function handleRevokeLink() {
    const authToken = requireAuthToken();
    if (!authToken || !generatedRequestToken) return;
    try {
      await revokePaymentRequestLink({ token: generatedRequestToken, authToken });
      setGeneratedLink("");
      setGeneratedRequestToken("");
      showLinkSuccess("Link revoked");
    } catch (err) {
      setLinkError(getUserErrorMessage(err, "Failed to revoke request link."));
    }
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
              <AmountInput
                value={linkAmount}
                onValueChange={(value) => {
                  setLinkAmount(value);
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
                  className={`inline-flex h-10 min-w-28 items-center justify-center gap-2 ${FORM_INLINE_SECONDARY_BUTTON_CLASS}`}
                >
                  <CopyIcon />
                  {linkCopied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={handleShareLink}
                  className={`inline-flex h-10 min-w-28 items-center justify-center gap-2 ${FORM_INLINE_PRIMARY_BUTTON_CLASS}`}
                >
                  <ShareIcon />
                  Share
                </button>
                <button
                  type="button"
                  onClick={handleRevokeLink}
                  className={`inline-flex h-10 min-w-28 items-center justify-center ${FORM_INLINE_SECONDARY_BUTTON_CLASS}`}
                >
                  Revoke
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
