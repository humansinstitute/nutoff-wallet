import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CashuWalletService } from "./service";
import {
  ApplesauceRelayPool,
  NostrServerTransport,
  PrivateKeySigner,
} from "@contextvm/sdk";

interface NWCResponse {
  result_type: string;
  result: any;
}

interface NWCError {
  error: string;
  message?: string;
}

// Create an MCP server for Cashu CLI Wallet
const server = new McpServer({
  name: "cashu-wallet",
  version: "1.0.0",
});

// Initialize wallet service
const walletService = new CashuWalletService();

// Helper function to format NWC responses
function formatNWCResponse(resultType: string, result: any): NWCResponse {
  return {
    result_type: resultType,
    result: result,
  };
}

function formatNWCError(error: string, message?: string): NWCError {
  return {
    error,
    message,
  };
}

// NWC API Methods

// get_balance - NWC format
server.registerTool(
  "get_balance",
  {
    title: "Get Balance (NWC)",
    description: "Get wallet balance in NWC API format",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await walletService.getBalance();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCResponse("get_balance", {
                balance: result.total, // NWC uses total balance in msats
              }),
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCError("INTERNAL_ERROR", error.message),
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

// pay_invoice - NWC format
server.registerTool(
  "pay_invoice",
  {
    title: "Pay Invoice (NWC)",
    description: "Pay a Lightning invoice in NWC API format",
    inputSchema: {
      invoice: z.string().min(1, "Lightning invoice is required"),
      amount: z.number().optional(), // Optional amount in msats
    },
  },
  async ({ invoice, amount }) => {
    try {
      const result = await walletService.payInvoice(invoice);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCResponse("pay_invoice", {
                preimage: result.paymentPreimage || "",
                fees_paid: result.feeReserve || 0,
              }),
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCError("PAYMENT_FAILED", error.message),
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

// make_invoice - NWC format (equivalent to create-mint-quote)
server.registerTool(
  "make_invoice",
  {
    title: "Create Invoice (NWC)",
    description: "Create a Lightning invoice in NWC API format",
    inputSchema: {
      amount: z.number().positive("Amount must be positive"),
      description: z.string().optional(),
      description_hash: z.string().optional(),
      expiry: z.number().optional(),
    },
  },
  async ({ amount, description, description_hash }) => {
    try {
      const result = await walletService.createMintQuote(amount);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCResponse("make_invoice", {
                type: "incoming",
                state: "pending",
                invoice: result.lightningInvoice,
                description: description || "",
                description_hash: description_hash || "",
                payment_hash: result.quoteId, // Using quoteId as payment_hash
                amount: amount,
                fees_paid: 0,
                created_at: Math.floor(Date.now() / 1000),
                expires_at: result.expiry,
                metadata: {},
              }),
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCError("INTERNAL_ERROR", error.message),
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

// lookup_invoice - NWC format (equivalent to check-mint-quote)
server.registerTool(
  "lookup_invoice",
  {
    title: "Lookup Invoice (NWC)",
    description:
      "Lookup invoice status in NWC API format - Use 'payment_hash' together with the quoteId to lookup a specific mint quote",
    inputSchema: {
      payment_hash: z.string().optional(),
      invoice: z.string().optional(),
    },
  },
  async ({ payment_hash, invoice }) => {
    try {
      // Use payment_hash (quoteId) if provided, otherwise extract from invoice
      const quoteId =
        payment_hash || (invoice ? invoice.substring(0, 10) : null);

      if (!quoteId) {
        throw new Error("Either payment_hash or invoice must be provided");
      }

      const result = await walletService.checkMintQuote(quoteId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCResponse("lookup_invoice", {
                type: "incoming",
                state: result.isPaid ? "settled" : "pending",
                invoice: invoice || "",
                payment_hash: result.quoteId,
                amount: result.amount,
                fees_paid: 0,
                created_at: Math.floor(Date.now() / 1000),
                expires_at: result.isPaid
                  ? Math.floor(Date.now() / 1000)
                  : Math.floor(Date.now() / 1000) + 3600,
                settled_at: result.isPaid
                  ? Math.floor(Date.now() / 1000)
                  : undefined,
                metadata: {},
              }),
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCError("NOT_FOUND", error.message),
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

// get_info - NWC format
server.registerTool(
  "get_info",
  {
    title: "Get Info (NWC)",
    description: "Get wallet information in NWC API format",
    inputSchema: {},
  },
  async () => {
    try {
      const lud06Info = walletService.getLUD06Info();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCResponse("get_info", lud06Info),
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              formatNWCError("INTERNAL_ERROR", error.message),
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

// const transport = new StdioServerTransport();

// Parse server private key from environment variable
const serverPrivateKey = process.env.SERVER_PRIVATE_KEY;

// Parse relay URLs from environment variable
const relayUrls = process.env.NOSTR_RELAYS
  ? process.env.NOSTR_RELAYS.split(",")
      .map((url) => url.trim())
      .filter((url) => url.length > 0)
  : ["wss://relay.contextvm.org"];

// Parse allowed public keys from environment variable
const allowedPublicKeys = process.env.ALLOWED_PUBLIC_KEYS
  ? process.env.ALLOWED_PUBLIC_KEYS.split(",")
      .map((key) => key.trim())
      .filter((key) => key.length > 0)
  : undefined;

const transport = new NostrServerTransport({
  relayHandler: new ApplesauceRelayPool(relayUrls),
  signer: new PrivateKeySigner(serverPrivateKey),
  allowedPublicKeys: allowedPublicKeys,
  excludedCapabilities: [
    {
      method: "tools/call",
      name: "mint-ecash",
    },
    {
      method: "tools/list",
    },
  ],
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down MCP server...");
  walletService.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down MCP server...");
  walletService.close();
  process.exit(0);
});

await server.connect(transport);
