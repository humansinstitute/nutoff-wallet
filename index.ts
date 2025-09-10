#!/usr/bin/env bun

// Re-export the CashuWalletService for library usage
export { CashuWalletService } from "./service";

// Re-export all types and interfaces
export type {
  CashuWalletConfig,
  BalanceResult,
  MintQuoteResult,
  MintQuoteStatusResult,
  MintProofsResult,
  SendEcashResult,
  ReceiveEcashResult,
  CleanPendingProofsResult,
  MintEcashResult,
  PayInvoiceResult,
  InfoResult,
} from "./service";

// Re-export the CLI class for programmatic CLI usage
export { CashuCLI } from "./cli";

// Run the CLI if this file is executed directly
if (import.meta.main) {
  // Import and run the CLI
  await import("./cli");
}
