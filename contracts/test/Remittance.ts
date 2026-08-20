import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("Remittance", function () {
  async function fixture() {
    const [owner, sender, receiver, other, newOwner] = await ethers.getSigners();
    const remittance = await ethers.deployContract("Remittance");
    const value = ethers.parseEther("1");
    const block = await ethers.provider.getBlock("latest");
    const expiresAt = BigInt(block!.timestamp + 3600);
    return { remittance, owner, sender, receiver, other, newOwner, value, expiresAt };
  }

  async function escrow() {
    const f = await fixture();
    await f.remittance.connect(f.sender).createEscrow(f.receiver.address, f.expiresAt, { value: f.value });
    return { ...f, id: 1n };
  }

  async function advanceTo(timestamp: bigint) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
    await ethers.provider.send("evm_mine", []);
  }

  describe("direct transfer compatibility", function () {
    it("transfers immediately and emits the original event", async function () {
      const { remittance, sender, receiver, value } = await fixture();
      const before = await ethers.provider.getBalance(receiver.address);
      await expect(remittance.connect(sender).transfer(receiver.address, { value }))
        .to.emit(remittance, "Transfer");
      expect(await ethers.provider.getBalance(receiver.address)).to.equal(before + value);
    });

    it("rejects invalid receiver, self-transfer, and zero value", async function () {
      const { remittance, sender, receiver } = await fixture();
      await expect(remittance.connect(sender).transfer(ethers.ZeroAddress, { value: 1 }))
        .to.be.revertedWithCustomError(remittance, "InvalidReceiver");
      await expect(remittance.connect(sender).transfer(sender.address, { value: 1 }))
        .to.be.revertedWithCustomError(remittance, "SelfTransfer");
      await expect(remittance.connect(sender).transfer(receiver.address))
        .to.be.revertedWithCustomError(remittance, "ZeroAmount");
    });
  });

  describe("escrow lifecycle", function () {
    it("creates sequential IDs and stores transaction data", async function () {
      const { remittance, sender, receiver, value, expiresAt } = await fixture();
      await expect(remittance.connect(sender).createEscrow(receiver.address, expiresAt, { value }))
        .to.emit(remittance, "EscrowCreated")
        .withArgs(1n, sender.address, receiver.address, value, expiresAt);
      await remittance.connect(sender).createEscrow(receiver.address, expiresAt, { value: 1 });
      expect(await remittance.nextTransactionId()).to.equal(3n);
      expect(await remittance.transactions(1n)).to.deep.equal([
        sender.address, receiver.address, value, expiresAt, 1n,
      ]);
    });

    it("reuses validation and requires a future expiry", async function () {
      const { remittance, sender, receiver, expiresAt } = await fixture();
      await expect(remittance.connect(sender).createEscrow(ethers.ZeroAddress, expiresAt, { value: 1 }))
        .to.be.revertedWithCustomError(remittance, "InvalidReceiver");
      await expect(remittance.connect(sender).createEscrow(sender.address, expiresAt, { value: 1 }))
        .to.be.revertedWithCustomError(remittance, "SelfTransfer");
      await expect(remittance.connect(sender).createEscrow(receiver.address, expiresAt))
        .to.be.revertedWithCustomError(remittance, "ZeroAmount");
      await expect(remittance.connect(sender).createEscrow(receiver.address, 1n, { value: 1 }))
        .to.be.revertedWithCustomError(remittance, "InvalidExpiry");
    });

    it("lets only the receiver claim before expiry", async function () {
      const { remittance, receiver, other, value, id } = await escrow();
      await expect(remittance.connect(other).claim(id)).to.be.revertedWithCustomError(remittance, "NotReceiver");
      await expect(remittance.connect(receiver).claim(id)).to.emit(remittance, "EscrowClaimed")
        .withArgs(id, receiver.address, value);
      expect(await remittance.withdrawableBalances(receiver.address)).to.equal(value);
      expect((await remittance.transactions(id)).status).to.equal(2n);
    });

    it("lets only the sender cancel at or after expiry", async function () {
      const { remittance, sender, other, value, expiresAt, id } = await escrow();
      await expect(remittance.connect(sender).cancel(id)).to.be.revertedWithCustomError(remittance, "TransactionNotExpired");
      await advanceTo(expiresAt);
      await expect(remittance.connect(other).cancel(id)).to.be.revertedWithCustomError(remittance, "NotSender");
      await expect(remittance.connect(sender).cancel(id)).to.emit(remittance, "EscrowCancelled")
        .withArgs(id, sender.address, value);
      expect(await remittance.withdrawableBalances(sender.address)).to.equal(value);
      expect((await remittance.transactions(id)).status).to.equal(3n);
    });

    it("rejects expired claims, unknown IDs, and repeated finalization", async function () {
      const { remittance, sender, receiver, expiresAt, id } = await escrow();
      await advanceTo(expiresAt);
      await expect(remittance.connect(receiver).claim(id)).to.be.revertedWithCustomError(remittance, "TransactionExpired");
      await remittance.connect(sender).cancel(id);
      await expect(remittance.connect(sender).cancel(id)).to.be.revertedWithCustomError(remittance, "TransactionNotPending");
      await expect(remittance.connect(receiver).claim(999n)).to.be.revertedWithCustomError(remittance, "TransactionNotPending");
    });
  });

  describe("safe withdrawals", function () {
    it("withdraws and clears a claimed balance", async function () {
      const { remittance, receiver, value, id } = await escrow();
      await remittance.connect(receiver).claim(id);
      await expect(remittance.connect(receiver).withdraw()).to.emit(remittance, "Withdrawal")
        .withArgs(receiver.address, value);
      expect(await remittance.withdrawableBalances(receiver.address)).to.equal(0n);
      expect(await ethers.provider.getBalance(await remittance.getAddress())).to.equal(0n);
      await expect(remittance.connect(receiver).withdraw()).to.be.revertedWithCustomError(remittance, "NoFundsToWithdraw");
    });

    it("combines multiple claims into one balance", async function () {
      const { remittance, sender, receiver, value, expiresAt } = await fixture();
      await remittance.connect(sender).createEscrow(receiver.address, expiresAt, { value });
      await remittance.connect(sender).createEscrow(receiver.address, expiresAt, { value });
      await remittance.connect(receiver).claim(1n);
      await remittance.connect(receiver).claim(2n);
      expect(await remittance.withdrawableBalances(receiver.address)).to.equal(value * 2n);
    });

    it("restores the balance when a recipient rejects payment", async function () {
      const { remittance, receiver, value, id } = await escrow();
      await remittance.connect(receiver).claim(id);

      // Runtime bytecode that always reverts, simulating a rejecting contract wallet.
      await ethers.provider.send("hardhat_setCode", [receiver.address, "0x60006000fd"]);
      await expect(remittance.connect(receiver).withdraw())
        .to.be.revertedWithCustomError(remittance, "TransferFailed");
      expect(await remittance.withdrawableBalances(receiver.address)).to.equal(value);
      await ethers.provider.send("hardhat_setCode", [receiver.address, "0x"]);
    });
  });

  describe("admin controls", function () {
    it("restricts pausing and ownership transfer", async function () {
      const { remittance, owner, other, newOwner } = await fixture();
      expect(await remittance.owner()).to.equal(owner.address);
      await expect(remittance.connect(other).pause()).to.be.revertedWithCustomError(remittance, "Unauthorized");
      await expect(remittance.transferOwnership(ethers.ZeroAddress)).to.be.revertedWithCustomError(remittance, "InvalidOwner");
      await expect(remittance.transferOwnership(newOwner.address)).to.emit(remittance, "OwnershipTransferred")
        .withArgs(owner.address, newOwner.address);
      await expect(remittance.pause()).to.be.revertedWithCustomError(remittance, "Unauthorized");
      await remittance.connect(newOwner).pause();
    });

    it("pauses new commitments without trapping escrowed funds", async function () {
      const { remittance, owner, sender, receiver, value, id } = await escrow();
      await expect(remittance.connect(owner).pause()).to.emit(remittance, "Paused").withArgs(owner.address);
      await expect(remittance.connect(sender).transfer(receiver.address, { value })).to.be.revertedWithCustomError(remittance, "ContractPaused");
      await expect(remittance.connect(sender).createEscrow(receiver.address, 9999999999n, { value })).to.be.revertedWithCustomError(remittance, "ContractPaused");
      await remittance.connect(receiver).claim(id);
      await remittance.connect(receiver).withdraw();
      await expect(remittance.connect(owner).pause()).to.be.revertedWithCustomError(remittance, "ContractPaused");
      await expect(remittance.connect(owner).unpause()).to.emit(remittance, "Unpaused").withArgs(owner.address);
      await expect(remittance.connect(owner).unpause()).to.be.revertedWithCustomError(remittance, "ContractNotPaused");
    });
  });
});
