import { network } from "hardhat";
import "dotenv/config";

const CONTRACT_ADDRESS = process.env.REM_CONTRACT_ADDRESS!;
const RECEIVER = process.env.REM_TEST_RECEIVER!;

async function main() {
  const { ethers } = await network.connect();

  const [sender] = await ethers.getSigners();
  console.log("Sender:", sender.address);

  console.log("Using contract:", CONTRACT_ADDRESS);
  console.log("Receiver:", RECEIVER);

  const remittance = await ethers.getContractAt("Remittance", CONTRACT_ADDRESS);

  const value = ethers.parseEther("0.001");

  const tx = await remittance.transfer(RECEIVER, { value });
  console.log("Sent tx:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt?.blockNumber);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
