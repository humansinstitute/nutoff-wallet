#!/usr/bin/env bun

import { CashuWalletService } from "./service";

// CLI wrapper for the CashuWalletService
class CashuCLI {
  private walletService: CashuWalletService;

  constructor() {
    this.walletService = new CashuWalletService();
  }

  async getBalance(): Promise<void> {
    try {
      const balanceResult = await this.walletService.getBalance();
      console.log(`Wallet Balance: ${balanceResult.balance} sats`);
      console.log(`Pending (sent): ${balanceResult.pendingBalance} sats`);
      console.log(`Total: ${balanceResult.total} sats`);

      if (balanceResult.pendingProofsCount > 0) {
        console.log(
          `\nChecked ${balanceResult.pendingProofsCount} pending proofs...`,
        );
      }

      console.log("\nBalance Information:");
      console.log(`- Available balance: ${balanceResult.balance} sats`);
      console.log(`- Pending balance: ${balanceResult.pendingBalance} sats`);
      console.log(`- Total balance: ${balanceResult.total} sats`);
      console.log(
        `- Pending proofs count: ${balanceResult.pendingProofsCount}`,
      );
    } catch (error) {
      console.error(
        "Error getting balance:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async mintEcash(amount: number): Promise<void> {
    try {
      console.log(`Creating mint quote for ${amount} satoshis...`);
      const mintResult = await this.walletService.mintEcash(amount);

      console.log(`\n✓ Minting complete!`);
      console.log("\nMinting Results:");
      console.log(`- Quote ID: ${mintResult.quoteId}`);
      console.log(`- Lightning invoice: ${mintResult.lightningInvoice}`);
      console.log(
        `- Minted ${mintResult.proofCount} proofs totaling ${mintResult.totalAmount} sats`,
      );
      console.log('\nUse "get-balance" to check your balance.');
    } catch (error) {
      console.error(
        "Error minting ecash:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async createMintQuote(amount: number): Promise<void> {
    try {
      const quoteResult = await this.walletService.createMintQuote(amount);

      console.log(`Mint quote created: ${quoteResult.quoteId}`);
      console.log(`Lightning invoice: ${quoteResult.lightningInvoice}`);
      console.log(`Amount: ${quoteResult.amount} sats`);
      console.log(
        "\nTo check the status of this quote, save the quote ID and use:",
      );
      console.log(`bun run index.ts check-mint-quote ${quoteResult.quoteId}`);

      console.log("\nMint Quote Created:");
      console.log(`- Quote ID: ${quoteResult.quoteId}`);
      console.log(`- Lightning invoice: ${quoteResult.lightningInvoice}`);
      console.log(`- Amount: ${quoteResult.amount} sats`);
      console.log(
        `- Expires at: ${new Date(quoteResult.expiry * 1000).toISOString()}`,
      );
    } catch (error) {
      console.error(
        "Error creating mint quote:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async checkMintQuote(quoteId: string): Promise<void> {
    try {
      console.log(`Checking status of quote: ${quoteId}`);
      const statusResult = await this.walletService.checkMintQuote(quoteId);

      console.log(`Quote status: ${statusResult.state}`);

      if (statusResult.isPaid) {
        console.log("Quote is paid! You can now mint the proofs.");
        console.log(`\nTo mint the proofs, run:`);
        console.log(
          `bun run index.ts mint-proofs ${quoteId} ${statusResult.amount}`,
        );
      } else if (statusResult.isIssued) {
        console.log("Quote has already been issued.");
      } else {
        console.log(
          "Quote is unpaid. Please pay the lightning invoice and try again.",
        );
      }

      console.log("\nMint Quote Status:");
      console.log(`- Quote ID: ${statusResult.quoteId}`);
      console.log(`- State: ${statusResult.state}`);
      console.log(`- Amount: ${statusResult.amount} sats`);
      console.log(`- Is paid: ${statusResult.isPaid ? "Yes" : "No"}`);
      console.log(`- Is issued: ${statusResult.isIssued ? "Yes" : "No"}`);
      console.log(`- Can mint: ${statusResult.canMint ? "Yes" : "No"}`);
    } catch (error) {
      console.error(
        "Error checking mint quote:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async mintProofs(quoteId: string, amount: number): Promise<void> {
    try {
      console.log(`Minting proofs for quote: ${quoteId}`);
      const mintProofsResult = await this.walletService.mintProofs(
        quoteId,
        amount,
      );

      console.log(`Successfully minted ${mintProofsResult.proofCount} proofs:`);
      console.log(`Total amount: ${mintProofsResult.totalAmount} sats`);
      console.log(
        `Proof amounts: ${mintProofsResult.proofAmounts.join(", ")} sats`,
      );
      console.log('\nWallet updated. Use "get-balance" to check your balance.');

      console.log("\nMinted Proofs:");
      console.log(`- Quote ID: ${mintProofsResult.quoteId}`);
      console.log(`- Total amount: ${mintProofsResult.totalAmount} sats`);
      console.log(`- Proof count: ${mintProofsResult.proofCount}`);
      console.log(
        `- Proof amounts: ${mintProofsResult.proofAmounts.join(", ")} sats`,
      );
    } catch (error) {
      console.error(
        "Error minting proofs:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async sendEcash(amount: number, mintUrl?: string): Promise<void> {
    try {
      console.log(`Sending ${amount} sats...`);
      if (mintUrl) {
        console.log(`Using mint URL: ${mintUrl}`);
      }
      const sendResult = await this.walletService.sendEcash(amount, mintUrl);

      console.log(`Sent: ${sendResult.sentAmount} sats`);
      console.log(`Keep: ${sendResult.keepAmount} sats`);

      console.log("\nCashu token (share this with recipient):");
      console.log(sendResult.cashuToken);
      console.log(
        '\nToken saved as pending. Use "get-balance" to check your balance.',
      );

      console.log("\nSend Transaction:");
      console.log(`- Sent amount: ${sendResult.sentAmount} sats`);
      console.log(`- Kept amount: ${sendResult.keepAmount} sats`);
      console.log(`- Cashu token: ${sendResult.cashuToken}`);
    } catch (error) {
      console.error(
        "Error sending ecash:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async receiveEcash(tokenString: string): Promise<void> {
    try {
      console.log("Receiving ecash...");
      const receiveResult = await this.walletService.receiveEcash(tokenString);

      console.log(`Successfully received ${receiveResult.proofCount} proofs:`);
      console.log(`Total amount: ${receiveResult.totalAmount} sats`);
      console.log(
        `Proof amounts: ${receiveResult.proofAmounts.join(", ")} sats`,
      );
      console.log('\nWallet updated. Use "get-balance" to check your balance.');

      console.log("\nReceived eCash:");
      console.log(`- Total amount: ${receiveResult.totalAmount} sats`);
      console.log(`- Proof count: ${receiveResult.proofCount}`);
      console.log(
        `- Proof amounts: ${receiveResult.proofAmounts.join(", ")} sats`,
      );
    } catch (error) {
      console.error(
        "Error receiving ecash:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async payInvoice(invoice: string): Promise<void> {
    try {
      console.log("Creating melt quote for invoice...");
      const payResult = await this.walletService.payInvoice(invoice);

      console.log("Payment initiated. Checking status...");
      console.log("Payment successful!");
      if (payResult.paymentPreimage) {
        console.log(`Payment preimage: ${payResult.paymentPreimage}`);
      }
      console.log(`Remaining balance: ${payResult.remainingBalance} sats`);

      console.log("\nPayment Results:");
      console.log(`- Melt quote ID: ${payResult.meltQuoteId}`);
      console.log(`- Amount paid: ${payResult.amountPaid} sats`);
      console.log(`- Fee reserve: ${payResult.feeReserve} sats`);
      console.log(`- Total amount: ${payResult.totalAmount} sats`);
      console.log(`- Remaining balance: ${payResult.remainingBalance} sats`);
      if (payResult.paymentPreimage) {
        console.log(`- Payment preimage: ${payResult.paymentPreimage}`);
      }
    } catch (error) {
      console.error(
        "Error paying invoice:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async cleanPendingProofs(): Promise<void> {
    try {
      const cleanResult = await this.walletService.cleanPendingProofs();

      if (cleanResult.cleanedCount > 0) {
        console.log(
          `\nCleaned up ${cleanResult.cleanedCount} redeemed proofs (${cleanResult.cleanedAmount} sats)`,
        );
      } else {
        console.log("No redeemed proofs found.");
      }

      console.log("\nCleanup Results:");
      console.log(`- Cleaned proofs: ${cleanResult.cleanedCount}`);
      console.log(`- Cleaned amount: ${cleanResult.cleanedAmount} sats`);
      console.log(`- Total checked: ${cleanResult.totalChecked}`);
      console.log(`- Remaining pending: ${cleanResult.remainingPending}`);
    } catch (error) {
      console.error(
        "Error cleaning pending proofs:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async getInfo(): Promise<void> {
    try {
      const infoResult = await this.walletService.getInfo();

      console.log("Mint URL:", infoResult.mintUrl);
      console.log("\nWallet Information:");
      console.log(`- Mint URL: ${infoResult.mintUrl}`);
      console.log(`- Wallet database: ${infoResult.walletDbPath}`);
      console.log(`- Unit: ${infoResult.unit}`);
    } catch (error) {
      console.error(
        "Error getting info:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  close(): void {
    this.walletService.close();
  }
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log("Cashu CLI Wallet");
    console.log("\nUsage: bun run index.ts <command> [args]");
    console.log("\nCommands:");
    console.log("  get-balance              - Show wallet balance");
    console.log("  mint <amount>            - Mint eCash (one-step process)");
    console.log("  create-mint <amount>     - Create a mint quote (advanced)");
    console.log("  check-mint-quote <id>    - Check mint quote status");
    console.log(
      "  mint-proofs <id> <amt>   - Mint proofs from quote (advanced)",
    );
    console.log("  send <amount> [mint-url] - Send ecash and generate token");
    console.log("  receive <token>          - Receive ecash from token");
    console.log("  pay <invoice>            - Pay Lightning invoice");
    console.log(
      "  clean-pending            - Clean up redeemed pending proofs",
    );
    console.log("\nEnvironment Variables:");
    console.log(
      "  DEFAULT_MINT            - Mint URL (default: https://mint.minibits.cash/Bitcoin)",
    );
    console.log(
      "  CASHU_MINT_URL/MINT_URL - Legacy mint env vars (optional)",
    );
    console.log(
      "  AUTO_MINT_PAID_QUOTES   - Auto-mint paid quotes (default: false)",
    );
    console.log(
      "  CASHU_WALLET_DB         - Wallet database path (default: ./wallet.sqlite)",
    );
    process.exit(0);
  }

  const cli = new CashuCLI();

  try {
    switch (command) {
      case "get-balance": {
        await cli.getBalance();
        break;
      }

      case "mint": {
        if (!args[1]) {
          console.error("Please provide an amount.");
          process.exit(1);
        }
        await cli.mintEcash(parseInt(args[1]));
        break;
      }

      case "create-mint":
      case "redeem-mint": {
        if (!args[1]) {
          console.error("Please provide an amount.");
          process.exit(1);
        }
        await cli.createMintQuote(parseInt(args[1]));
        break;
      }

      case "check-mint-quote": {
        if (!args[1]) {
          console.error("Please provide a quote ID.");
          process.exit(1);
        }
        await cli.checkMintQuote(args[1]);
        break;
      }

      case "mint-proofs": {
        if (!args[1] || !args[2]) {
          console.error("Please provide both quote ID and amount.");
          process.exit(1);
        }
        await cli.mintProofs(args[1], parseInt(args[2]));
        break;
      }

      case "send": {
        if (!args[1]) {
          console.error("Please provide an amount.");
          process.exit(1);
        }
        const amount = parseInt(args[1]);
        const mintUrl = args[2]; // Optional mint URL
        await cli.sendEcash(amount, mintUrl);
        break;
      }

      case "receive": {
        if (!args[1]) {
          console.error("Please provide a token string.");
          process.exit(1);
        }
        await cli.receiveEcash(args[1]);
        break;
      }

      case "pay": {
        if (!args[1]) {
          console.error("Please provide a Lightning invoice.");
          process.exit(1);
        }
        await cli.payInvoice(args[1]);
        break;
      }

      case "clean-pending": {
        await cli.cleanPendingProofs();
        break;
      }

      case "get-info": {
        await cli.getInfo();
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Use "bun run index.ts" to see available commands.');
        process.exit(1);
    }
  } catch (error) {
    console.error(
      "Error executing command:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  } finally {
    cli.close();
  }
}

// Run the CLI
if (import.meta.main) {
  main().catch((error) => {
    console.error(
      "Fatal error:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}

export { CashuCLI };
