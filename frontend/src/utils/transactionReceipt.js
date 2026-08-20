import { jsPDF } from "jspdf";
import { displayCurrency } from "./currency.js";
import { formatDateTime } from "./datetime.js";

const PAGE_WIDTH = 210;
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function printable(value, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function partyLabel(transaction, prefix) {
  const username = transaction?.[`${prefix}Username`];
  const displayName = transaction?.[`${prefix}DisplayName`];
  const wallet = transaction?.[`${prefix}Wallet`];
  const name = username ? `@${username}` : displayName;

  return {
    name: printable(name || wallet),
    wallet: name && wallet ? printable(wallet) : "",
  };
}

function receiptFilename(transaction) {
  const reference = printable(transaction?.id, transaction?.txHash || "transaction")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 36);
  return `transaction-receipt-${reference}.pdf`;
}

export function downloadTransactionReceipt(transaction) {
  if (String(transaction?.status || "").toLowerCase() !== "success") {
    throw new Error("A receipt is only available for successful transactions.");
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const sender = partyLabel(transaction, "sender");
  const receiver = partyLabel(transaction, "receiver");
  const asset = displayCurrency(transaction.assetSymbol);
  const amount = typeof transaction.amount === "number" ? transaction.amount : printable(transaction.amount);
  const direction = String(transaction.direction || transaction.type || "sent").toLowerCase() === "received"
    ? "Received"
    : "Sent";

  doc.setFillColor(88, 28, 135);
  doc.rect(0, 0, PAGE_WIDTH, 48, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.text("Transaction receipt", MARGIN, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Proof of a completed transfer", MARGIN, 31);

  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(`${amount} ${asset}`, MARGIN, 67);
  doc.setFontSize(10);
  doc.setTextColor(21, 128, 61);
  doc.text("SUCCESSFUL", MARGIN, 76);

  if (typeof transaction.fiatAmountUsd === "number") {
    doc.setTextColor(107, 114, 128);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Approx. ${transaction.fiatAmountUsd.toFixed(2)} ${printable(transaction.fiatCurrency, "USD")}`,
      MARGIN,
      84
    );
  }

  let y = 101;
  const addRow = (label, value, options = {}) => {
    const lines = doc.splitTextToSize(printable(value), options.monospace ? 113 : 118);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(label, MARGIN, y);
    doc.setFont(options.monospace ? "courier" : "helvetica", "normal");
    doc.setFontSize(options.monospace ? 8 : 10);
    doc.setTextColor(31, 41, 55);
    doc.text(lines, 73, y);
    y += Math.max(11, lines.length * 4.2 + 4);
    doc.setDrawColor(229, 231, 235);
    doc.line(MARGIN, y - 5, PAGE_WIDTH - MARGIN, y - 5);
  };

  addRow("Transfer type", direction);
  addRow("Sender", sender.name);
  if (sender.wallet) addRow("Sender wallet", sender.wallet, { monospace: true });
  addRow("Receiver", receiver.name);
  if (receiver.wallet) addRow("Receiver wallet", receiver.wallet, { monospace: true });
  addRow("Created", formatDateTime(transaction.createdAt));
  addRow("Last updated", formatDateTime(transaction.updatedAt));
  addRow("Transaction ID", transaction.id, { monospace: true });
  addRow("Transaction hash", transaction.txHash || "Not available", { monospace: true });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(
    "This receipt confirms the transaction status recorded by the remittance service.",
    MARGIN,
    278
  );
  doc.text(`Generated ${formatDateTime(new Date())}`, MARGIN, 284);
  doc.text("Page 1 of 1", PAGE_WIDTH - MARGIN, 284, { align: "right" });

  doc.save(receiptFilename(transaction));
}
