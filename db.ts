import { Database } from "bun:sqlite";
import type { Proof } from "@cashu/cashu-ts";
import { unlinkSync } from "fs";

interface Migration {
  id: string;
  sql: string;
}

const MIGRATIONS: readonly Migration[] = [
  {
    id: "001_initial",
    sql: `
      CREATE TABLE IF NOT EXISTS cashu_proofs (
        mintUrl   TEXT NOT NULL,
        id        TEXT NOT NULL,
        amount    INTEGER NOT NULL,
        secret    TEXT NOT NULL,
        C         TEXT NOT NULL,
        dleqJson  TEXT,
        witnessJson   TEXT,
        state     TEXT NOT NULL CHECK (state IN ('inflight', 'ready', 'spent')),
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (mintUrl, secret)
      );

      CREATE INDEX IF NOT EXISTS idx_cashu_proofs_state ON cashu_proofs(state);
      CREATE INDEX IF NOT EXISTS idx_cashu_proofs_mint_state ON cashu_proofs(mintUrl, state);
      CREATE INDEX IF NOT EXISTS idx_cashu_proofs_mint_id_state ON cashu_proofs(mintUrl, id, state);

      CREATE TABLE IF NOT EXISTS cashu_mint_quotes (
        mintUrl TEXT NOT NULL,
        quote   TEXT NOT NULL,
        state   TEXT NOT NULL CHECK (state IN ('UNPAID','PAID','ISSUED')),
        request TEXT NOT NULL,
        amount  INTEGER NOT NULL,
        unit    TEXT NOT NULL,
        expiry  INTEGER NOT NULL,
        pubkey  TEXT,
        PRIMARY KEY (mintUrl, quote)
      );

      CREATE INDEX IF NOT EXISTS idx_cashu_mint_quotes_state ON cashu_mint_quotes(state);
      CREATE INDEX IF NOT EXISTS idx_cashu_mint_quotes_mint ON cashu_mint_quotes(mintUrl);
    `,
  },
];

export function getUnixTimeSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export class SqliteDb {
  private db: Database;

  constructor(filename: string) {
    try {
      this.db = new Database(filename, { create: true });
      this.initialize();
    } catch (error) {
      // If database is corrupted, delete it and create a new one
      console.warn("Database corrupted, creating new one...");
      try {
        unlinkSync(filename);
      } catch (e) {
        // File might not exist
      }
      this.db = new Database(filename, { create: true });
      this.initialize();
    }
  }

  private initialize(): void {
    // Ensure pragmas for current connection and create migrations tracking table
    this.db.run(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS cashu_migrations (
        id        TEXT PRIMARY KEY,
        appliedAt INTEGER NOT NULL
      );
    `);

    const appliedRows = this.db
      .query("SELECT id FROM cashu_migrations ORDER BY id ASC")
      .all() as { id: string }[];
    const applied = new Set(appliedRows.map((r) => r.id));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;

      const transaction = this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db.run(
          "INSERT INTO cashu_migrations (id, appliedAt) VALUES (?, ?)",
          [migration.id, getUnixTimeSeconds()],
        );
      });

      transaction();
    }
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(
    sql: string,
    params?: any[],
  ): { lastInsertRowid: number | bigint; changes: number } {
    return params ? this.db.run(sql, params) : this.db.run(sql);
  }

  query(sql: string) {
    return this.db.query(sql);
  }

  all<T = any>(sql: string, params?: any[]): T[] {
    const stmt = this.db.query(sql);
    return params ? (stmt.all(...params) as T[]) : (stmt.all() as T[]);
  }

  get<T = any>(sql: string, params?: any[]): T | undefined {
    const stmt = this.db.query(sql);
    return params
      ? (stmt.get(...params) as T | undefined)
      : (stmt.get() as T | undefined);
  }

  transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  close(): void {
    this.db.close();
  }
}

// Wallet database interface
export interface WalletMint {
  mintUrl: string;
  name: string;
  mintInfo: string;
  createdAt: number;
  updatedAt: number;
}

export interface WalletKeyset {
  mintUrl: string;
  id: string;
  keypairs: string;
  active: number;
  feePpk: number;
  updatedAt: number;
}

export interface WalletCounter {
  mintUrl: string;
  keysetId: string;
  counter: number;
}

export interface WalletProof {
  mintUrl: string;
  id: string;
  amount: number;
  secret: string;
  C: string;
  dleqJson?: string;
  witnessJson?: string;
  state: "inflight" | "ready" | "spent";
  createdAt: number;
}

export interface WalletMintQuote {
  mintUrl: string;
  quote: string;
  state: "UNPAID" | "PAID" | "ISSUED";
  request: string;
  amount: number;
  unit: string;
  expiry: number;
  pubkey?: string;
}

export class WalletDb {
  private db: SqliteDb;

  constructor(filename: string) {
    this.db = new SqliteDb(filename);
  }

  // Proof operations
  getProofs(
    mintUrl: string,
    state?: "inflight" | "ready" | "spent",
  ): WalletProof[] {
    let sql = "SELECT * FROM cashu_proofs WHERE mintUrl = ?";
    const params = [mintUrl];

    if (state) {
      sql += " AND state = ?";
      params.push(state);
    }

    return this.db.all<WalletProof>(sql, params);
  }

  getAllProofs(state?: "inflight" | "ready" | "spent"): WalletProof[] {
    let sql = "SELECT * FROM cashu_proofs";
    const params = [];

    if (state) {
      sql += " WHERE state = ?";
      params.push(state);
    }

    return this.db.all<WalletProof>(sql, params);
  }

  saveProofs(
    proofs: Proof[],
    mintUrl: string,
    state: "inflight" | "ready" = "ready",
  ): void {
    const timestamp = getUnixTimeSeconds();

    this.db.transaction(() => {
      for (const proof of proofs) {
        this.db.run(
          `INSERT OR REPLACE INTO cashu_proofs 
           (mintUrl, id, amount, secret, C, dleqJson, witnessJson, state, createdAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mintUrl,
            proof.id,
            proof.amount,
            proof.secret,
            proof.C,
            proof.dleq ? JSON.stringify(proof.dleq) : null,
            proof.witness ? JSON.stringify(proof.witness) : null,
            state,
            timestamp,
          ],
        );
      }
    });
  }

  updateProofState(
    secret: string,
    state: "inflight" | "ready" | "spent",
  ): void {
    this.db.run("UPDATE cashu_proofs SET state = ? WHERE secret = ?", [
      state,
      secret,
    ]);
  }

  deleteProof(secret: string): void {
    this.db.run("DELETE FROM cashu_proofs WHERE secret = ?", [secret]);
  }

  // Mint quote operations
  getMintQuote(mintUrl: string, quote: string): WalletMintQuote | undefined {
    return this.db.get<WalletMintQuote>(
      "SELECT * FROM cashu_mint_quotes WHERE mintUrl = ? AND quote = ?",
      [mintUrl, quote],
    );
  }

  saveMintQuote(quote: WalletMintQuote): void {
    this.db.run(
      `INSERT OR REPLACE INTO cashu_mint_quotes 
       (mintUrl, quote, state, request, amount, unit, expiry, pubkey) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quote.mintUrl,
        quote.quote,
        quote.state,
        quote.request,
        quote.amount,
        quote.unit,
        quote.expiry,
        quote.pubkey || null,
      ],
    );
  }

  updateMintQuoteState(
    mintUrl: string,
    quote: string,
    state: "UNPAID" | "PAID" | "ISSUED",
  ): void {
    this.db.run(
      "UPDATE cashu_mint_quotes SET state = ? WHERE mintUrl = ? AND quote = ?",
      [state, mintUrl, quote],
    );
  }

  // Utility methods
  getBalance(mintUrl?: string): number {
    let sql = "SELECT SUM(amount) as total FROM cashu_proofs WHERE state = ?";
    const params = ["ready"];

    if (mintUrl) {
      sql += " AND mintUrl = ?";
      params.push(mintUrl);
    }

    const result = this.db.get<{ total: number }>(sql, params);
    return result?.total || 0;
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn);
  }
}
