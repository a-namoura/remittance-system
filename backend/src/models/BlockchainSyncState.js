import mongoose from "mongoose";

const blockchainSyncStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    chainId: {
      type: Number,
      required: true,
    },
    contractAddress: {
      type: String,
      required: true,
      trim: true,
    },
    lastProcessedBlock: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

export const BlockchainSyncState = mongoose.model(
  "BlockchainSyncState",
  blockchainSyncStateSchema
);
