import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { JsonRpcProvider, Wallet, Contract, isAddress, parseEther } from "ethers";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root of the repo: backend/src/blockchain.. = remittance-system/
const rootDir = path.resolve(__dirname, "..", "..", "..");
const blockchainDir = path.join(rootDir, "blockchain");

// Load ABI from blockchain/Remittance.abi.json
const abiPath = path.join(blockchainDir, "Remittance.abi.json");
let REMITTANCE_ABI;

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
  const RPC_URL = process.env.BSC_TESTNET_RPC_URL;
  const PRIVATE_KEY = process.env.BSC_TESTNET_PRIVATE_KEY;
  const CONTRACT_ADDRESS = process.env.REM_CONTRACT_ADDRESS;

  if (!RPC_URL) {
    throw new Error("BSC_TESTNET_RPC_URL is not set in backend/.env");
  }
  if (!PRIVATE_KEY) {
    throw new Error("BSC_TESTNET_PRIVATE_KEY is not set in backend/.env");
  }
  if (!CONTRACT_ADDRESS) {
    throw new Error("REM_CONTRACT_ADDRESS is not set in backend/.env");
  }

  if (!isAddress(CONTRACT_ADDRESS)) {
    throw new Error(`Invalid REM_CONTRACT_ADDRESS: ${CONTRACT_ADDRESS}`);
  }

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);

  const contract = new Contract(CONTRACT_ADDRESS, REMITTANCE_ABI, wallet);

  return { contract, wallet };
}

/**
 * Helper to send a remittance transaction.
 * receiver: string (0x...)
 * amountEth: string or number (e.g. "0.01")
 */
export async function sendRemittance(receiver, amountEth) {
  if (!isAddress(receiver)) {
    throw new Error("Receiver must be a valid address.");
  }

  const { contract, wallet } = getRemittanceClient();

  const value = parseEther(String(amountEth));

  const tx = await contract.transfer(receiver, { value });
  const receipt = await tx.wait();

  return {
    from: wallet.address,
    to: receiver,
    value: amountEth,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
    status: receipt?.status,
  };
}
