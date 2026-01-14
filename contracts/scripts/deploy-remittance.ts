import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "BNB (testnet)");

  const remittance = await ethers.deployContract("Remittance");
  await remittance.waitForDeployment();

  console.log("Remittance deployed at:", await remittance.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
