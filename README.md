⚠️ This project is for educational and testing purposes. Use at your own risk.

# Nutoff Wallet

A command-line interface and MCP server interface implementing a Cashu wallet, built with TypeScript, ContextVM, Cashu-ts, and Bun. This wallet allows you to mint, send, receive, and manage eCash tokens. Also thanks to the MCP interface and the nostr transport provided by the ContextVM sdk you can use and manage your wallet remotely

## Features

- **Wallet Management**: Create and manage eCash wallets with persistent state
- **Mint Operations**: Create mint quotes, check their status, and mint eCash proofs
- **Send/Receive**: Send eCash tokens to others and receive tokens from them
- **Lightning Payments**: Pay Lightning invoices using your eCash balance
- **Balance Tracking**: Monitor your wallet balance and pending transactions
- **Environment Configuration**: Customize mint URLs and wallet file locations
- **NWC API Compatibility**: Partial Nostr Wallet Connect (NWC) API support for integration with NWC clients

## Prerequisites

- [Bun](https://bun.sh/) runtime installed
- Node.js compatibility (for some dependencies)

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   bun install
   ```

## Usage

### Basic Commands

Show help and available commands:

```bash
bun run index.ts
```

Check wallet balance:

```bash
bun run index.ts get-balance
```

### Minting eCash (Simplified)

One-step minting - creates quote, waits for payment, and mints automatically:

```bash
bun run index.ts mint 100
```

### Advanced Minting (Manual Steps)

Create a mint quote for 100 sats:

```bash
bun run index.ts create-mint 100
```

Check the status of a mint quote:

```bash
bun run index.ts check-mint-quote <quote-id>
```

Mint proofs from a paid quote:

```bash
bun run index.ts mint-proofs <quote-id> <amount>
```

### Sending and Receiving

Send eCash to someone:

```bash
bun run index.ts send 50
```

Receive eCash from a token:

```bash
bun run index.ts receive <cashu-token>
```

### Lightning Payments

Pay a Lightning invoice:

```bash
bun run index.ts pay <lightning-invoice>
```

### Wallet Maintenance

Clean up redeemed pending proofs - automatically removes proofs that have been redeemed:

```bash
bun run index.ts clean-pending
```

**Note**: `get-balance` automatically checks and cleans pending proofs!

## Environment Variables

Configure the wallet using environment variables:

- `DEFAULT_MINT`: Primary mint URL to use (default: https://mint.minibits.cash/Bitcoin)
- `CASHU_MINT_URL`, `MINT_URL`: Legacy mint variables still honored for compatibility
- `AUTO_MINT_PAID_QUOTES`: Set to `true` to automatically mint proofs once invoices are paid (default: false)
- `CASHU_WALLET_DB`: Path to the wallet database file (default: ./wallet.sqlite)

### LUD06 Configuration (for Lightning Address / LNURL-pay compatibility)

The `get_info` method returns LUD06-compliant responses for Lightning Address integration:

- `LUD06_CALLBACK`: Callback URL for LNURL-pay requests (default: empty string)
- `LUD06_MAX_SENDABLE`: Maximum amount in millisatoshis (default: 1000000000)
- `LUD06_MIN_SENDABLE`: Minimum amount in millisatoshis (default: 1000)
- `LUD06_METADATA`: Metadata JSON string for LNURL-pay (default: empty array)
- `LUD06_TAG`: LNURL tag (default: "payRequest")

Example:

```bash
DEFAULT_MINT=https://your-mint.example.com \
LUD06_CALLBACK=https://your-service.com/lnurl-pay/callback \
LUD06_MAX_SENDABLE=1000000000 \
LUD06_MIN_SENDABLE=1000 \
LUD06_METADATA='[["text/plain", "Pay to my Cashu wallet"]]' \
bun run index.ts get-balance
```

See `example.env` for a complete configuration template.

## Wallet Database

The wallet state is persisted in a SQLite database file with the following structure:

- **cashu_mints**: Mint information and metadata
- **cashu_keysets**: Keyset information for each mint
- **cashu_counters**: Spending counters for keysets
- **cashu_proofs**: Your eCash proofs with states (inflight, ready, spent)
- **cashu_mint_quotes**: Mint quotes and their payment status

## Testing

Run the comprehensive test suite:

```bash
bun test
```

Run specific test file:

```bash
bun test wallet.test.ts
```

## NWC API Support

The wallet now supports the full Nostr Wallet Connect (NWC) API specification, making it compatible with NWC clients and tools.

### NWC API Methods

- `get_balance` - Get wallet balance in millisatoshis
- `get_info` - Get wallet information and supported methods
- `make_invoice` - Create Lightning invoices for receiving payments
- `lookup_invoice` - Check invoice status and details
- `pay_invoice` - Pay Lightning invoices

## Example Workflow

1. **Create a new wallet** (automatically created on first use):

   ```bash
   bun run index.ts get-balance
   ```

2. **Mint some eCash** (using simplified one-step process):

   ```bash
   bun run index.ts mint 1000
   # The command will wait for payment and mint automatically
   ```

   Or use the manual process:

   ```bash
   bun run index.ts create-mint 1000
   # Pay the Lightning invoice that is generated
bun run index.ts check-mint-quote <quote-id>
bun run index.ts mint-proofs <quote-id> 1000
```

By default, the wallet waits for you to run `mint-proofs` before newly paid invoices affect your balance. Set `AUTO_MINT_PAID_QUOTES=true` if you prefer automatic minting.

3. **Check your balance** (auto-cleans pending proofs):

   ```bash
   bun run index.ts get-balance
   ```

4. **Send eCash to someone**:

   ```bash
   bun run index.ts send 500
   # Share the generated Cashu token with the recipient
   ```

5. **Receive eCash**:

   ```bash
   bun run index.ts receive <cashu-token-from-sender>
   ```

6. **Clean up redeemed proofs** (or let get-balance do it automatically):
   ```bash
   bun run index.ts clean-pending
   ```

## Security Notes

- Keep your wallet database secure and backed up
- The wallet database contains your eCash proofs - treat it like cash
- Test with small amounts first
- Use reputable mints

## Development

The project structure:

- `service.ts` - Wallet service implementation
- `index.ts` - CLI interface for the cashu wallet
- `cli.ts` - CLI implementation of the cashu wallet
- `mcp-server.ts` - MCP interface for the cashu wallet, using ContextVM Nostr Server Transport
- `db.ts` - Database utils for the cashu wallet

## License

This project is for educational and testing purposes. Use at your own risk.
