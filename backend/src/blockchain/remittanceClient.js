import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  formatEther,
  parseEther,
} from "ethers";
import { normalizeEvmAddress } from "../utils/walletAddress.js";
import { incrementMetric } from "../utils/metrics.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root of the repo: backend/src/blockchain.. = remittance-system/
const rootDir = path.resolve(__dirname, "..", "..", "..");
const blockchainDir = path.join(rootDir, "blockchain");

// Load ABI from blockchain/Remittance.abi.json
const abiPath = path.join(blockchainDir, "Remittance.abi.json");
let REMITTANCE_ABI;
let providerInstance;
let readContractInstance;
let readContractAddress;

const DEFAULT_RPC_TIMEOUT_MS = 30_000;
const USER_TRANSACTION_LOOKUP_ATTEMPTS = 5;
const USER_TRANSACTION_LOOKUP_DELAY_MS = 200;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTransactionWithPropagationRetry(provider, txHash) {
  for (let attempt = 1; attempt <= USER_TRANSACTION_LOOKUP_ATTEMPTS; attempt += 1) {
    let tx;
    try {
      tx = await provider.getTransaction(txHash);
    } catch (err) {
      incrementMetric("rpc_failures_total", { operation: "get_transaction" });
      throw err;
    }
    if (tx) return tx;
    if (attempt < USER_TRANSACTION_LOOKUP_ATTEMPTS) {
      await delay(USER_TRANSACTION_LOOKUP_DELAY_MS);
    }
  }
  return null;
}

function getRpcTimeoutMs() {
  const configured = Number(process.env.BSC_RPC_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_RPC_TIMEOUT_MS;
}

try {
  const abiRaw = fs.readFileSync(abiPath, "utf8");
  REMITTANCE_ABI = JSON.parse(abiRaw);
} catch (err) {
  console.error("Failed to read Remittance ABI:", err);
  REMITTANCE_ABI = [];
}

/**
 * Returns an object with:
 * - contract: ethers Contract instance (connected to signer)
 * - wallet: signer wallet
 */
export function getRemittanceClient() {
  const PRIVATE_KEY = process.env.BSC_TESTNET_PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    throw new Error("BSC_TESTNET_PRIVATE_KEY is not set in backend/.env");
  }

  const provider = getRemittanceProvider();
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const contract = new Contract(
    getRemittanceContractAddress(),
    REMITTANCE_ABI,
    wallet
  );

  return { contract, wallet };
}

export function getRemittanceProvider() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
  if (!rpcUrl) {
    throw new Error("BSC_TESTNET_RPC_URL is not set in backend/.env");
  }

  if (!providerInstance) {
    const request = new FetchRequest(rpcUrl);
    request.timeout = getRpcTimeoutMs();
    providerInstance = new JsonRpcProvider(request, undefined, {
      batchMaxCount: 1,
    });
  }

  return providerInstance;
}

export function getRemittanceContractAddress() {
  const contractAddress = process.env.REM_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("REM_CONTRACT_ADDRESS is not set in backend/.env");
  }

  const normalizedContractAddress = normalizeEvmAddress(contractAddress);
  if (!normalizedContractAddress) {
    throw new Error(`Invalid REM_CONTRACT_ADDRESS: ${contractAddress}`);
  }

  return normalizedContractAddress;
}

export function getRemittanceReadContract() {
  const contractAddress = getRemittanceContractAddress();
  if (!readContractInstance || readContractAddress !== contractAddress) {
    readContractInstance = new Contract(
      contractAddress,
      REMITTANCE_ABI,
      getRemittanceProvider()
    );
    readContractAddress = contractAddress;
  }

  return readContractInstance;
}

function createConfirmationWaiter({ tx, wallet, normalizedReceiver, amountEth }) {
  return async function waitForConfirmation() {
    const receipt = await tx.wait();

    return {
      from: wallet.address,
      to: normalizedReceiver,
      value: amountEth,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      status: receipt?.status,
    };
  };
}

export function getRemittanceSignerAddress() {
  const privateKey = process.env.BSC_TESTNET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("BSC_TESTNET_PRIVATE_KEY is not set in backend/.env");
  }
  return normalizeEvmAddress(new Wallet(privateKey).address);
}

/**
 * Broadcasts a remittance transaction and returns after the network accepts it.
 * Confirmation is intentionally left to the caller so API requests do not wait
 * for block confirmation time.
 */
export async function submitRemittance(
  receiver,
  amountEth,
  { onSubmitted, getClient = getRemittanceClient } = {}
) {
  const normalizedReceiver = normalizeEvmAddress(receiver);
  if (!normalizedReceiver) {
    throw new Error("Receiver must be a valid address.");
  }

  const { contract, wallet } = getClient();

  const onChainSender = normalizeEvmAddress(wallet.address);
  if (!onChainSender) {
    throw new Error("Configured blockchain signer has an invalid address.");
  }
  if (onChainSender === normalizedReceiver) {
    throw new Error("The receiver cannot be the blockchain signer address.");
  }

  const value = parseEther(String(amountEth));

  const tx = await contract.transfer(normalizedReceiver, { value });
  const submittedAt = new Date();
  const submission = {
    from: onChainSender,
    to: normalizedReceiver,
    value: amountEth,
    txHash: tx.hash,
    submittedAt,
    status: "pending",
  };

  if (typeof onSubmitted === "function") {
    try {
      await onSubmitted(submission);
    } catch (err) {
      console.error("Failed to persist submitted transaction hash:", err.message);
    }
  }

  return {
    ...submission,
    waitForConfirmation: createConfirmationWaiter({
      tx,
      wallet,
      normalizedReceiver,
      amountEth,
    }),
  };
}

/**
 * Adopts a transaction broadcast by a user's injected wallet. The transaction
 * is validated before it is attached to an application payment record.
 */
export async function getUserRemittanceSubmission(
  txHash,
  { sender, receiver, amountEth } = {}
) {
  const normalizedSender = normalizeEvmAddress(sender);
  const normalizedReceiver = normalizeEvmAddress(receiver);
  const normalizedHash = String(txHash || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedHash)) {
    throw new Error("A valid wallet transaction hash is required.");
  }
  if (!normalizedSender || !normalizedReceiver) {
    throw new Error("Sender and receiver must be valid addresses.");
  }

  const provider = getRemittanceProvider();
  const tx = await getTransactionWithPropagationRetry(provider, normalizedHash);
  if (!tx) throw new Error("The wallet transaction was not found on the configured network.");

  const contractAddress = getRemittanceContractAddress();
  if (normalizeEvmAddress(tx.from) !== normalizedSender) {
    throw new Error("The wallet transaction was not signed by your linked wallet.");
  }
  if (normalizeEvmAddress(tx.to) !== contractAddress) {
    throw new Error("The wallet transaction was not sent to the remittance contract.");
  }
  if (tx.value !== parseEther(String(amountEth))) {
    throw new Error("The wallet transaction amount does not match the payment amount.");
  }

  let parsed;
  try {
    parsed = new Contract(contractAddress, REMITTANCE_ABI).interface.parseTransaction({
      data: tx.data,
      value: tx.value,
    });
  } catch {
    throw new Error("The wallet transaction does not contain a valid remittance transfer.");
  }
  if (parsed?.name !== "transfer" || normalizeEvmAddress(parsed.args?.[0]) !== normalizedReceiver) {
    throw new Error("The wallet transaction receiver does not match the payment receiver.");
  }

  const submittedAt = new Date();
  return {
    from: normalizedSender,
    to: normalizedReceiver,
    value: amountEth,
    txHash: tx.hash,
    submittedAt,
    status: "pending",
    waitForConfirmation: async () => {
      const receipt = await tx.wait();
      return {
        from: normalizedSender,
        to: normalizedReceiver,
        value: amountEth,
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
        status: receipt?.status,
      };
    },
  };
}

/**
 * Helper to send a remittance transaction and wait for confirmation.
 * receiver: string (0x...)
 * amountEth: string or number (e.g. "0.01")
 */
export async function sendRemittance(receiver, amountEth, options = {}) {
  const submission = await submitRemittance(receiver, amountEth, options);
  return submission.waitForConfirmation();
}

/**
 * Helper to read the native-asset balance of any address.
 * Returns a Number (e.g., 0.1234)
 */
export async function getEthBalance(address) {
  const normalizedAddress = normalizeEvmAddress(address);
  if (!normalizedAddress) {
    throw new Error("Address must be a valid EVM address.");
  }

  const provider = getRemittanceProvider();
  let balanceWei;
  try {
    balanceWei = await provider.getBalance(normalizedAddress);
  } catch (err) {
    incrementMetric("rpc_failures_total", { operation: "get_balance" });
    throw err;
  }
  const balanceEth = Number(formatEther(balanceWei));

  return balanceEth;
}
