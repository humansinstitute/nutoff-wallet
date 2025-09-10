import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { CashuWalletService } from "./service";

const TEST_WALLET_DB = join(process.cwd(), "test-library-wallet.sqlite");
const TEST_MINT_URL = "https://testnut.cashu.space";

describe("CashuWalletService Library", () => {
  let walletService: CashuWalletService;

  beforeEach(() => {
    // Clean up any existing test wallet
    if (existsSync(TEST_WALLET_DB)) {
      unlinkSync(TEST_WALLET_DB);
    }

    // Create new wallet service instance
    walletService = new CashuWalletService({
      mintUrl: TEST_MINT_URL,
      walletDbPath: TEST_WALLET_DB,
    });
  });

  afterEach(() => {
    // Clean up
    walletService.close();
    if (existsSync(TEST_WALLET_DB)) {
      unlinkSync(TEST_WALLET_DB);
    }
  });

  test("should initialize wallet service with zero balance", async () => {
    const balance = await walletService.getBalance();

    expect(balance.balance).toBe(0);
    expect(balance.pendingBalance).toBe(0);
    expect(balance.total).toBe(0);
    expect(balance.pendingProofsCount).toBe(0);
  });

  test("should get wallet info", () => {
    const info = walletService.getInfo();

    expect(info.mintUrl).toBe(TEST_MINT_URL);
    expect(info.walletDbPath).toBe(TEST_WALLET_DB);
    expect(info.unit).toBe("sat");
  });

  test("should fail to create mint quote with invalid amount", async () => {
    await expect(walletService.createMintQuote(0)).rejects.toThrow(
      "Invalid amount",
    );
    await expect(walletService.createMintQuote(-100)).rejects.toThrow(
      "Invalid amount",
    );
  });

  test("should fail to check mint quote without quote ID", async () => {
    await expect(walletService.checkMintQuote("")).rejects.toThrow(
      "Please provide a quote ID",
    );
  });

  test("should fail to mint proofs without required parameters", async () => {
    await expect(walletService.mintProofs("", 100)).rejects.toThrow(
      "Please provide both quote ID and amount",
    );
    await expect(walletService.mintProofs("quote-id", 0)).rejects.toThrow(
      "Please provide both quote ID and amount",
    );
  });

  test("should fail to send ecash with invalid amount", async () => {
    await expect(walletService.sendEcash(0)).rejects.toThrow("Invalid amount");
    await expect(walletService.sendEcash(-100)).rejects.toThrow(
      "Invalid amount",
    );
  });

  test("should fail to send ecash with insufficient balance", async () => {
    await expect(walletService.sendEcash(1000)).rejects.toThrow(
      "Insufficient balance",
    );
  });

  test("should fail to receive ecash without token", async () => {
    await expect(walletService.receiveEcash("")).rejects.toThrow(
      "Please provide a Cashu token string",
    );
  });

  test("should fail to pay invoice without invoice", async () => {
    await expect(walletService.payInvoice("")).rejects.toThrow(
      "Please provide a Lightning invoice",
    );
  });

  test("should clean pending proofs with no pending proofs", async () => {
    const result = await walletService.cleanPendingProofs();

    expect(result.cleanedCount).toBe(0);
    expect(result.cleanedAmount).toBe(0);
    expect(result.totalChecked).toBe(0);
    expect(result.remainingPending).toBe(0);
  });

  test("should handle multiple wallet instances independently", async () => {
    const walletService2 = new CashuWalletService({
      mintUrl: TEST_MINT_URL,
      walletDbPath: join(process.cwd(), "test-library-wallet2.sqlite"),
    });

    try {
      const balance1 = await walletService.getBalance();
      const balance2 = await walletService2.getBalance();

      expect(balance1.balance).toBe(0);
      expect(balance2.balance).toBe(0);

      // Both should have different database paths
      expect(walletService.getInfo().walletDbPath).not.toBe(
        walletService2.getInfo().walletDbPath,
      );
    } finally {
      walletService2.close();
      const wallet2Path = join(process.cwd(), "test-library-wallet2.sqlite");
      if (existsSync(wallet2Path)) {
        unlinkSync(wallet2Path);
      }
    }
  });

  test("should be usable as a library without CLI dependencies", () => {
    // Verify that the service can be imported and instantiated without CLI dependencies
    expect(walletService).toBeDefined();
    expect(typeof walletService.getBalance).toBe("function");
    expect(typeof walletService.createMintQuote).toBe("function");
    expect(typeof walletService.sendEcash).toBe("function");
    expect(typeof walletService.receiveEcash).toBe("function");
    expect(typeof walletService.payInvoice).toBe("function");
    expect(typeof walletService.cleanPendingProofs).toBe("function");
    expect(typeof walletService.getInfo).toBe("function");
  });

  test("should handle configuration through constructor", () => {
    const customConfig = {
      mintUrl: "https://custom.mint.example.com",
      walletDbPath: join(process.cwd(), "custom-wallet.sqlite"),
      unit: "msat" as const,
    };

    const customWallet = new CashuWalletService(customConfig);

    try {
      const info = customWallet.getInfo();
      expect(info.mintUrl).toBe(customConfig.mintUrl);
      expect(info.walletDbPath).toBe(customConfig.walletDbPath);
      expect(info.unit).toBe(customConfig.unit);
    } finally {
      customWallet.close();
      if (existsSync(customConfig.walletDbPath)) {
        unlinkSync(customConfig.walletDbPath);
      }
    }
  });
});
