import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("Remittance", function () {
  it("transfers ETH and emits Transfer", async function () {
    const [sender, receiver] = await ethers.getSigners();

    const remittance = await ethers.deployContract("Remittance");

    const value = ethers.parseEther("1");

    await expect(
      remittance.connect(sender).transfer(receiver.address, { value })
    )
      .to.emit(remittance, "Transfer")

    const before = await ethers.provider.getBalance(receiver.address);

    // send another transfer and verify balance increases
    await remittance.connect(sender).transfer(receiver.address, { value });

    const after = await ethers.provider.getBalance(receiver.address);
    expect(after - before).to.equal(value);
  });

  it("reverts on zero amount", async function () {
    const [sender, receiver] = await ethers.getSigners();

    const remittance = await ethers.deployContract("Remittance");

    await expect(
      remittance.connect(sender).transfer(receiver.address, { value: 0 })
    ).to.be.revertedWithCustomError(remittance, "ZeroAmount");
  });

  it("reverts on invalid receiver", async function () {
    const [sender] = await ethers.getSigners();

    const remittance = await ethers.deployContract("Remittance");

    await expect(
      remittance.connect(sender).transfer(ethers.ZeroAddress, { value: 1 })
    ).to.be.revertedWithCustomError(remittance, "InvalidReceiver");
  });
});
