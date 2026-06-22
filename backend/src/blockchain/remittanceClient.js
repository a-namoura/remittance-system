import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { JsonRpcProvider, Wallet, Contract, parseEther, formatEther } from "ethers";
import { normalizeEvmAddress } from "../utils/walletAddress.js";

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
    providerInstance = new JsonRpcProvider(rpcUrl);
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

/**
 * Helper to send a remittance transaction.
 * receiver: string (0x...)
 * amountEth: string or number (e.g. "0.01")
 */
export async function sendRemittance(
  receiver,
  amountEth,
  { onSubmitted } = {}
) {
  const normalizedReceiver = normalizeEvmAddress(receiver);
  if (!normalizedReceiver) {
    throw new Error("Receiver must be a valid address.");
  }

  const { contract, wallet } = getRemittanceClient();

  const value = parseEther(String(amountEth));

  const tx = await contract.transfer(normalizedReceiver, { value });

  if (typeof onSubmitted === "function") {
    try {
      await onSubmitted({
        from: wallet.address,
        to: normalizedReceiver,
        value: amountEth,
        txHash: tx.hash,
        submittedAt: new Date(),
      });
    } catch (err) {
      console.error("Failed to persist submitted transaction hash:", err.message);
    }
  }

  const receipt = await tx.wait();

  return {
    from: wallet.address,
    to: normalizedReceiver,
    value: amountEth,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
    status: receipt?.status,
  };
}

/**
 * Helper to read the ETH balance of any address (in BNB/ETH units).
 * Returns a Number (e.g., 0.1234)
 */
export async function getEthBalance(address) {
  const normalizedAddress = normalizeEvmAddress(address);
  if (!normalizedAddress) {
    throw new Error("Address must be a valid EVM address.");
  }

  const provider = getRemittanceProvider();
  const balanceWei = await provider.getBalance(normalizedAddress);
  const balanceEth = Number(formatEther(balanceWei));

  return balanceEth;
}
