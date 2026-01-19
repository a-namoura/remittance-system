import { ethers } from "ethers";

// BSC Testnet chainId = 97 (0x61)
const EXPECTED_CHAIN_ID = "0x61";

export function getEthereum() {
  if (typeof window !== "undefined" && window.ethereum) return window.ethereum;
  throw new Error("MetaMask is not available in this browser.");
}

export async function connectWallet() {
  const ethereum = getEthereum();

  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts || accounts.length === 0) throw new Error("No accounts returned from wallet.");

  const address = ethers.getAddress(accounts[0]);
  const chainId = await ethereum.request({ method: "eth_chainId" });

  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Wrong network. Switch to BSC Testnet (chainId ${EXPECTED_CHAIN_ID}).`);
  }

  const provider = new ethers.BrowserProvider(ethereum);
  const balanceWei = await provider.getBalance(address);
  const balance = ethers.formatEther(balanceWei);

  return { address, chainId, balance };
}

export async function signLinkMessage(message) {
  const ethereum = getEthereum();
  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const signature = await signer.signMessage(message);
  const address = await signer.getAddress();
  return { address, signature };
}
