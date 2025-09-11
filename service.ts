import {
  CashuMint,
  CashuWallet,
  getEncodedTokenV4,
  MeltQuoteState,
  MintQuoteState,
  type Proof,
  type Token,
} from "@cashu/cashu-ts";
import { join } from "path";
import { WalletDb } from "./db";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

interface QuotePoolItem {
  quoteId: string;
  amount: number;
  expiry: number;
}

interface QuotePoolConfig {
  checkIntervalMs?: number;
  maxConcurrentChecks?: number;
}
export interface CashuWalletConfig {
  mintUrl?: string;
  walletDbPath?: string;
  unit?: string;
  lud06Callback?: string;
  lud06MaxSendable?: number;
  lud06MinSendable?: number;
  lud06Metadata?: string;
  lud06Tag?: string;
}

export interface BalanceResult {
  balance: number;
  pendingBalance: number;
  total: number;
  pendingProofsCount: number;
}

export interface MintQuoteResult {
  quoteId: string;
  lightningInvoice: string;
  amount: number;
  expiry: number;
}

export interface MintQuoteStatusResult {
  quoteId: string;
  state: string;
  amount: number;
  isPaid: boolean;
  isIssued: boolean;
  canMint: boolean;
}

export interface MintProofsResult {
  proofs: Proof[];
  totalAmount: number;
  proofCount: number;
  proofAmounts: number[];
  quoteId: string;
}

export interface SendEcashResult {
  sentAmount: number;
  keepAmount: number;
  sentProofs: Proof[];
  keepProofs: Proof[];
  cashuToken: string;
  token: Token;
}

export interface ReceiveEcashResult {
  receivedProofs: Proof[];
  totalAmount: number;
  proofCount: number;
  proofAmounts: number[];
}

export interface CleanPendingProofsResult {
  cleanedCount: number;
  cleanedAmount: number;
  totalChecked: number;
  remainingPending: number;
}

export interface MintEcashResult {
  proofs: Proof[];
  totalAmount: number;
  proofCount: number;
  proofAmounts: number[];
  quoteId: string;
  lightningInvoice: string;
}

export interface PayInvoiceResult {
  meltQuoteId: string;
  amountPaid: number;
  feeReserve: number;
  totalAmount: number;
  paymentPreimage?: string;
  remainingBalance: number;
  changeProofs?: Proof[];
  sentProofs: Proof[];
  keptProofs: Proof[];
}

export interface InfoResult {
  mintUrl: string;
  walletDbPath: string;
  unit: string;
}

export interface LUD06InfoResult {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: string;
}

class QuotePoolManager {
  private quotes: Map<string, QuotePoolItem> = new Map();
  private isRunning = false;
  private checkInterval?: Timer;
  private readonly config: Required<QuotePoolConfig>;
  private readonly walletService: CashuWalletService;

  constructor(walletService: CashuWalletService, config: QuotePoolConfig = {}) {
    this.walletService = walletService;
    this.config = {
      checkIntervalMs: config.checkIntervalMs || 5000,
      maxConcurrentChecks: config.maxConcurrentChecks || 5,
    };
  }

  addQuote(quoteId: string, amount: number, expiry: number): void {
    this.quotes.set(quoteId, {
      quoteId,
      amount,
      expiry,
    });

    if (!this.isRunning) {
      this.start();
    }
  }

  removeQuote(quoteId: string): void {
    this.quotes.delete(quoteId);

    if (this.quotes.size === 0) {
      this.stop();
    }
  }

  private start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.checkInterval = setInterval(() => {
      this.checkQuotes();
    }, this.config.checkIntervalMs);
  }

  private stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  private async checkQuotes(): Promise<void> {
    // Clean up expired quotes first
    this.cleanupExpiredQuotes();

    const quotesToCheck = Array.from(this.quotes.values()).slice(
      0,
      this.config.maxConcurrentChecks,
    );

    if (quotesToCheck.length === 0) {
      return;
    }

    await Promise.allSettled(
      quotesToCheck.map((quote) => this.checkAndMintQuote(quote)),
    );
  }

  private async checkAndMintQuote(quote: QuotePoolItem): Promise<void> {
    try {
      const status = await this.walletService.checkMintQuote(quote.quoteId);

      if (status.isPaid && !status.isIssued) {
        console.log(`Quote ${quote.quoteId} is paid, minting proofs...`);
        await this.walletService.mintProofs(quote.quoteId, quote.amount);
        console.log(`Successfully minted proofs for quote ${quote.quoteId}`);
        this.removeQuote(quote.quoteId);
      } else if (status.isIssued) {
        console.log(
          `Quote ${quote.quoteId} is already issued, removing from pool`,
        );
        this.removeQuote(quote.quoteId);
      }
    } catch (error) {
      console.error(`Error checking/minting quote ${quote.quoteId}:`, error);
      // Continue checking on next interval, don't remove quote due to errors
    }
  }

  private cleanupExpiredQuotes(): void {
    let removedCount = 0;

    for (const [quoteId, quote] of this.quotes.entries()) {
      if (Math.floor(Date.now() / 1000) > quote.expiry) {
        this.quotes.delete(quoteId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} expired quotes from pool`);
    }

    if (this.quotes.size === 0) {
      this.stop();
    }
  }

  getPoolStatus(): { active: number } {
    return {
      active: this.quotes.size,
    };
  }

  destroy(): void {
    this.stop();
    this.quotes.clear();
  }
}

export class CashuWalletService {
  private walletDb: WalletDb;
  private cashuWallet: CashuWallet | null = null;
  private cashuMint: CashuMint | null = null;
  private quotePoolManager: QuotePoolManager;

  private readonly mintUrl: string;
  private readonly walletDbPath: string;
  private readonly unit: string;
  private readonly lud06Callback: string;
  private readonly lud06MaxSendable: number;
  private readonly lud06MinSendable: number;
  private readonly lud06Metadata: string;
  private readonly lud06Tag: string;

  constructor(config: CashuWalletConfig = {}) {
    this.mintUrl =
      config.mintUrl || process.env.MINT_URL || "https://testnut.cashu.space";
    this.walletDbPath =
      config.walletDbPath ||
      process.env.CASHU_WALLET_DB ||
      join(process.cwd(), "wallet.sqlite");
    this.unit = config.unit || "sat";

    // LUD06 configuration with fallback values
    this.lud06Callback =
      config.lud06Callback || process.env.LUD06_CALLBACK || "";
    this.lud06MaxSendable =
      config.lud06MaxSendable ||
      parseInt(process.env.LUD06_MAX_SENDABLE || "1000000000", 10);
    this.lud06MinSendable =
      config.lud06MinSendable ||
      parseInt(process.env.LUD06_MIN_SENDABLE || "1000", 10);
    this.lud06Metadata =
      config.lud06Metadata || process.env.LUD06_METADATA || "";
    this.lud06Tag = config.lud06Tag || process.env.LUD06_TAG || "payRequest";

    this.walletDb = new WalletDb(this.walletDbPath);
    this.quotePoolManager = new QuotePoolManager(this);
  }

  private async ensureWalletInitialized(): Promise<void> {
    if (!this.cashuWallet || !this.cashuMint) {
      this.cashuMint = new CashuMint(this.mintUrl);
      this.cashuWallet = new CashuWallet(this.cashuMint, { unit: this.unit });
      await this.cashuWallet.loadMint();
    }
  }

  private sumProofs(proofs: Proof[]): number {
    return proofs.reduce((acc: number, proof: Proof) => acc + proof.amount, 0);
  }

  async getBalance(): Promise<BalanceResult> {
    await this.ensureWalletInitialized();

    const pendingProofs = this.walletDb.getProofs(this.mintUrl, "inflight");
    const balance = this.walletDb.getBalance(this.mintUrl);
    const pendingBalance = this.sumProofs(pendingProofs);

    // Auto-clean pending proofs if there are any
    if (pendingProofs.length > 0) {
      await this.cleanPendingProofs();
    }

    return {
      balance,
      pendingBalance,
      total: balance + pendingBalance,
      pendingProofsCount: pendingProofs.length,
    };
  }

  async createMintQuote(amount: number): Promise<MintQuoteResult> {
    await this.ensureWalletInitialized();
    if (!amount || amount <= 0) {
      throw new Error("Invalid amount. Please provide a positive number.");
    }

    const quote = await this.cashuWallet!.createMintQuote(amount);

    if (quote.error) {
      throw new Error(
        `Error creating mint quote: ${quote.error} ${quote.code} ${quote.detail}`,
      );
    }
    // Save mint quote to database
    this.walletDb.saveMintQuote({
      mintUrl: this.mintUrl,
      quote: quote.quote,
      state: "UNPAID",
      request: quote.request,
      amount: amount,
      unit: this.unit,
      expiry: quote.expiry,
    });

    // Add quote to the monitoring pool for automatic minting
    this.quotePoolManager.addQuote(quote.quote, amount, quote.expiry);

    return {
      quoteId: quote.quote,
      lightningInvoice: quote.request,
      amount,
      expiry: quote.expiry,
    };
  }

  async checkMintQuote(quoteId: string): Promise<MintQuoteStatusResult> {
    await this.ensureWalletInitialized();

    if (!quoteId) {
      throw new Error("Please provide a quote ID.");
    }

    const quote = await this.cashuWallet!.checkMintQuote(quoteId);

    if (quote.error) {
      throw new Error(
        `Error checking mint quote: ${quote.error} ${quote.code} ${quote.detail}`,
      );
    }

    // Update quote state in database
    this.walletDb.updateMintQuoteState(
      this.mintUrl,
      quoteId,
      quote.state as "UNPAID" | "PAID" | "ISSUED",
    );

    const isPaid = quote.state === MintQuoteState.PAID;
    const isIssued = quote.state === MintQuoteState.ISSUED;
    const canMint = isPaid && !isIssued;

    return {
      quoteId,
      state: quote.state,
      amount: quote.amount || 0,
      isPaid,
      isIssued,
      canMint,
    };
  }

  async mintProofs(quoteId: string, amount: number): Promise<MintProofsResult> {
    await this.ensureWalletInitialized();

    if (!quoteId || !amount) {
      throw new Error("Please provide both quote ID and amount.");
    }

    const proofs = await this.cashuWallet!.mintProofs(amount, quoteId);

    if (!proofs || proofs.length === 0) {
      throw new Error("No proofs were minted.");
    }

    // Save proofs to database
    this.walletDb.saveProofs(proofs, this.mintUrl, "ready");

    // Update quote state to ISSUED
    this.walletDb.updateMintQuoteState(this.mintUrl, quoteId, "ISSUED");

    return {
      proofs,
      totalAmount: this.sumProofs(proofs),
      proofCount: proofs.length,
      proofAmounts: proofs.map((p) => p.amount),
      quoteId,
    };
  }

  async sendEcash(amount: number): Promise<SendEcashResult> {
    await this.ensureWalletInitialized();

    if (!amount || amount <= 0) {
      throw new Error("Invalid amount. Please provide a positive number.");
    }

    // Get available proofs
    const availableProofs = this.walletDb.getProofs(this.mintUrl, "ready");
    const totalBalance = this.sumProofs(availableProofs);

    if (totalBalance < amount) {
      throw new Error(
        `Insufficient balance. You have ${totalBalance} sats, but trying to send ${amount} sats.`,
      );
    }

    const { keep, send } = await this.cashuWallet!.send(
      amount,
      availableProofs,
      {
        includeFees: true,
      },
    );

    // Update database state
    this.walletDb.transaction(() => {
      // First, mark all available proofs as spent (they're being used in this transaction)
      for (const proof of availableProofs) {
        this.walletDb.updateProofState(proof.secret, "spent");
      }

      // Save the new keep proofs as ready
      this.walletDb.saveProofs(keep, this.mintUrl, "ready");

      // Save the sent proofs as inflight
      this.walletDb.saveProofs(send, this.mintUrl, "inflight");
    });

    // Create token for sending
    const token: Token = {
      mint: this.mintUrl,
      proofs: send,
    };

    const cashuString = getEncodedTokenV4(token);

    return {
      sentAmount: this.sumProofs(send),
      keepAmount: this.sumProofs(keep),
      sentProofs: send,
      keepProofs: keep,
      cashuToken: cashuString,
      token,
    };
  }

  async receiveEcash(tokenString: string): Promise<ReceiveEcashResult> {
    await this.ensureWalletInitialized();

    if (!tokenString) {
      throw new Error("Please provide a Cashu token string.");
    }

    const receivedProofs = await this.cashuWallet!.receive(tokenString);

    if (!receivedProofs || receivedProofs.length === 0) {
      throw new Error("No proofs were received.");
    }

    // Save received proofs to database
    this.walletDb.saveProofs(receivedProofs, this.mintUrl, "ready");

    return {
      receivedProofs,
      totalAmount: this.sumProofs(receivedProofs),
      proofCount: receivedProofs.length,
      proofAmounts: receivedProofs.map((p) => p.amount),
    };
  }

  async cleanPendingProofs(): Promise<CleanPendingProofsResult> {
    await this.ensureWalletInitialized();

    const pendingProofs = this.walletDb.getProofs(this.mintUrl, "inflight");

    if (pendingProofs.length === 0) {
      return {
        cleanedCount: 0,
        cleanedAmount: 0,
        totalChecked: 0,
        remainingPending: 0,
      };
    }

    let cleanedCount = 0;
    let cleanedAmount = 0;

    try {
      const proofStates =
        await this.cashuWallet!.checkProofsStates(pendingProofs);

      for (let i = 0; i < proofStates.length; i++) {
        const proof = pendingProofs[i];
        const proofState = proofStates[i];

        if (proof && proofState && proofState.state === "SPENT") {
          // Proof has been redeemed
          cleanedCount++;
          cleanedAmount += proof.amount;
          this.walletDb.updateProofState(proof.secret, "spent");
        } else if (proof && proofState && proofState.state === "UNSPENT") {
          // Do nothing - leave it as inflight so it gets checked again next time
        }
      }
    } catch (error: any) {
      // Log error but don't throw - this is a cleanup operation
      console.warn("Error checking proof states:", error.message);
    }

    return {
      cleanedCount,
      cleanedAmount,
      totalChecked: pendingProofs.length,
      remainingPending: pendingProofs.length - cleanedCount,
    };
  }

  async mintEcash(amount: number): Promise<MintEcashResult> {
    await this.ensureWalletInitialized();

    if (!amount || amount <= 0) {
      throw new Error("Invalid amount. Please provide a positive number.");
    }

    // Step 1: Create mint quote
    const quote = await this.cashuWallet!.createMintQuote(amount);

    if (quote.error) {
      throw new Error(
        `Error creating mint quote: ${quote.error} ${quote.code} ${quote.detail}`,
      );
    }

    // Save mint quote to database
    this.walletDb.saveMintQuote({
      mintUrl: this.mintUrl,
      quote: quote.quote,
      state: "UNPAID",
      request: quote.request,
      amount: amount,
      unit: this.unit,
      expiry: quote.expiry,
    });

    // Step 2: Wait for payment with polling.
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let paid = false;

    while (attempts < maxAttempts && !paid) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

      const quoteStatus = await this.cashuWallet!.checkMintQuote(quote.quote);

      if (quoteStatus.state === MintQuoteState.PAID) {
        paid = true;
      } else if (quoteStatus.state === MintQuoteState.ISSUED) {
        throw new Error("Quote has already been issued.");
      } else {
        attempts++;
      }
    }

    if (!paid) {
      throw new Error("Timeout waiting for payment. Please try again later.");
    }

    // Step 3: Mint the proofs
    const proofs = await this.cashuWallet!.mintProofs(amount, quote.quote);

    if (!proofs || proofs.length === 0) {
      throw new Error("No proofs were minted.");
    }

    // Save proofs to database
    this.walletDb.saveProofs(proofs, this.mintUrl, "ready");

    // Update quote state to ISSUED
    this.walletDb.updateMintQuoteState(this.mintUrl, quote.quote, "ISSUED");

    return {
      proofs,
      totalAmount: this.sumProofs(proofs),
      proofCount: proofs.length,
      proofAmounts: proofs.map((p) => p.amount),
      quoteId: quote.quote,
      lightningInvoice: quote.request,
    };
  }

  async payInvoice(invoice: string): Promise<PayInvoiceResult> {
    await this.ensureWalletInitialized();

    if (!invoice) {
      throw new Error("Please provide a Lightning invoice.");
    }

    const meltQuote = await this.cashuWallet!.createMeltQuote(invoice);

    if (meltQuote.error) {
      throw new Error(
        `Error creating melt quote: ${meltQuote.error} ${meltQuote.code} ${meltQuote.detail}`,
      );
    }

    const amountToMelt = meltQuote.amount + meltQuote.fee_reserve;
    const availableProofs = this.walletDb.getProofs(this.mintUrl, "ready");
    const totalBalance = this.sumProofs(availableProofs);

    if (totalBalance < amountToMelt) {
      throw new Error(
        `Insufficient balance. You have ${totalBalance} sats, but need ${amountToMelt} sats (including fees).`,
      );
    }

    // Prepare proofs for melting
    const { keep, send } = await this.cashuWallet!.send(
      amountToMelt,
      availableProofs,
      {
        includeFees: true,
      },
    );

    // Execute the melt
    const { change } = await this.cashuWallet!.meltProofs(meltQuote, send);

    // Update database state
    this.walletDb.transaction(() => {
      // First, mark all available proofs as spent (they're being used in this transaction)
      for (const proof of availableProofs) {
        this.walletDb.updateProofState(proof.secret, "spent");
      }

      // Save the new keep proofs as ready
      this.walletDb.saveProofs(keep, this.mintUrl, "ready");

      // Save the sent proofs as inflight
      this.walletDb.saveProofs(send, this.mintUrl, "inflight");

      // Save change proofs as ready
      if (change && change.length > 0) {
        this.walletDb.saveProofs(change, this.mintUrl, "ready");
      }
    });

    let paymentPreimage: string | undefined;
    let remainingBalance: number = 0;

    // Check melt status
    const checkMeltStatus = async () => {
      const quote = await this.cashuWallet!.checkMeltQuote(meltQuote.quote);

      if (quote.state === MeltQuoteState.PAID) {
        if (quote.payment_preimage) {
          paymentPreimage = quote.payment_preimage;
        }
        remainingBalance = this.walletDb.getBalance(this.mintUrl);
        return true; // Payment completed
      } else {
        return false; // Payment not completed
      }
    };

    // Wait a bit for the payment to complete, retry?
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await checkMeltStatus();

    return {
      meltQuoteId: meltQuote.quote,
      amountPaid: meltQuote.amount,
      feeReserve: meltQuote.fee_reserve,
      totalAmount: amountToMelt,
      paymentPreimage,
      remainingBalance:
        remainingBalance || this.walletDb.getBalance(this.mintUrl),
      changeProofs: change,
      sentProofs: send,
      keptProofs: keep,
    };
  }

  getInfo(): InfoResult {
    return {
      mintUrl: this.mintUrl,
      walletDbPath: this.walletDbPath,
      unit: this.unit,
    };
  }

  getLUD06Info(): LUD06InfoResult {
    return {
      callback: this.lud06Callback,
      maxSendable: this.lud06MaxSendable,
      minSendable: this.lud06MinSendable,
      metadata: this.lud06Metadata,
      tag: this.lud06Tag,
    };
  }

  close(): void {
    if (this.quotePoolManager) {
      this.quotePoolManager.destroy();
    }
    if (this.walletDb) {
      this.walletDb.close();
    }
  }

  getQuotePoolStatus(): { active: number } {
    return this.quotePoolManager.getPoolStatus();
  }
}
