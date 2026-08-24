import { Notification } from "../models/Notification.js";
import { Transaction } from "../models/Transaction.js";

// Older releases could label a transaction reversed without moving funds.
// Restore those records to their real successful state and remove messages
// that claimed a reversal happened. A valid reversal always has both proof
// fields written only after a successful blockchain receipt.
export async function repairUnfundedReversals() {
  const invalid = await Transaction.find({
    status: "reversed",
    $or: [
      { reversalStatus: { $ne: "success" } },
      { reversalTxHash: { $exists: false } },
      { reversalTxHash: null },
      { reversalTxHash: "" },
      { reversalReceiverBalanceBefore: { $exists: false } },
      { reversalReceiverBalanceAfter: { $exists: false } },
      { reversalSenderBalanceBefore: { $exists: false } },
      { reversalSenderBalanceAfter: { $exists: false } },
    ],
  }).select("_id").lean();
  if (!invalid.length) return 0;

  const transactionIds = invalid.map((item) => item._id);
  await Transaction.updateMany(
    { _id: { $in: transactionIds } },
    {
      $set: { status: "success" },
      $unset: {
        reversedAt: 1,
        reversedByAdminId: 1,
        reversalReason: 1,
        reversalStatus: 1,
        reversalTxHash: 1,
        reversalSubmittedAt: 1,
        reversalFailureReason: 1,
        reversalReceiverBalanceBefore: 1,
        reversalReceiverBalanceAfter: 1,
        reversalSenderBalanceBefore: 1,
        reversalSenderBalanceAfter: 1,
        reversalGasSponsored: 1,
        reversalGasFundingTxHash: 1,
      },
    }
  );
  await Notification.deleteMany({ type: "transaction_reversed", transactionId: { $in: transactionIds } });
  return transactionIds.length;
}
