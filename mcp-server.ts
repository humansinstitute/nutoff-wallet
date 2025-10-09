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
  [key: string]: unknown; // Add index signature for MCP compatibility
}

interface NWCError {
  error: string;
  message?: string;
  [key: string]: unknown; // Add index signature for MCP compatibility
}

// Output Schemas
export const GetBalanceOutputSchema = z.object({
  result_type: z.literal("get_balance"),
  result: z.object({
    balance: z.number(),
  }),
});

export const PayInvoiceOutputSchema = z.object({
  result_type: z.literal("pay_invoice"),
  result: z.object({
    preimage: z.string(),
    fees_paid: z.number(),
  }),
});

export const MakeInvoiceOutputSchema = z.object({
  result_type: z.literal("make_invoice"),
  result: z.object({
    type: z.literal("incoming"),
    state: z.literal("pending"),
    invoice: z.string(),
    description: z.string(),
    description_hash: z.string(),
    payment_hash: z.string(),
    amount: z.number(),
    created_at: z.number(),
    expires_at: z.number(),
  }),
});

export const SendEcashOutputSchema = z.object({
  sentAmount: z.number(),
  keepAmount: z.number(),
  cashuToken: z.string(),
  proofCount: z.number(),
  timestamp: z.string(),
});

export const LookupInvoiceOutputSchema = z.object({
  result_type: z.literal("lookup_invoice"),
  result: z.object({
    isPaid: z.boolean(),
    isIssued: z.boolean(),
    payment_hash: z.string(),
    amount: z.number(),
  }),
});

export const GetInfoOutputSchema = z.object({
  result_type: z.literal("get_info"),
  result: z.object({
    methods: z.array(z.string()),
    info: z.object({
      name: z.string(),
      picture: z.string().optional(),
      about: z.string().optional(),
      nip05: z.string().optional(),
      lud16: z.string().optional(),
    }),
    supported_methods: z.array(z.string()),
    max_amount: z.number(),
    min_amount: z.number(),
    currencies: z.array(z.string()),
    // LUD06 specific fields
    callback: z.string().optional(),
    tag: z.string().optional(),
    metadata: z.array(z.array(z.string())).optional(),
    max_sendable: z.number().optional(),
    min_sendable: z.number().optional(),
  }),
});

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
    outputSchema: GetBalanceOutputSchema.shape,
  },
  async () => {
    try {
      const result = await walletService.getBalance();
      const balanceResponse = formatNWCResponse("get_balance", {
        balance: result.total, // NWC uses total balance in msats
      });
      
      return {
        structuredContent: balanceResponse,
        content: [
          {
            type: "text",
            text: JSON.stringify(balanceResponse, null, 2),
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
    outputSchema: PayInvoiceOutputSchema.shape,
  },
  async ({ invoice, amount }) => {
    try {
      const result = await walletService.payInvoice(invoice);
      const paymentResponse = formatNWCResponse("pay_invoice", {
        preimage: result.paymentPreimage || "",
        fees_paid: result.feeReserve || 0,
      });
      
      return {
        structuredContent: paymentResponse,
        content: [
          {
            type: "text",
            text: JSON.stringify(paymentResponse, null, 2),
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
    outputSchema: MakeInvoiceOutputSchema.shape,
  },
  async ({ amount, description, description_hash }) => {
    try {
      const result = await walletService.createMintQuote(amount);
      const invoiceResponse = formatNWCResponse("make_invoice", {
        type: "incoming",
        state: "pending",
        invoice: result.lightningInvoice,
        description: description || "",
        description_hash: description_hash || "",
        payment_hash: result.quoteId, // Using quoteId as payment_hash
        amount: amount,
        created_at: Math.floor(Date.now() / 1000),
        expires_at: result.expiry,
      });
      
      return {
        structuredContent: invoiceResponse,
        content: [
          {
            type: "text",
            text: JSON.stringify(invoiceResponse, null, 2),
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

// Send eCash Tool
server.registerTool(
  "send_ecash",
  {
    title: "Send eCash",
    description: "Create an eCash token",
    inputSchema: {
      amount: z.number().positive("Amount must be positive"),
      mint_url: z
        .string()
        .url()
        .optional()
        .describe("Optional mint URL to use for selecting proofs"),
    },
    outputSchema: SendEcashOutputSchema.shape,
  },
  async ({ amount, mint_url }) => {
    const result = await walletService.sendEcash(amount, mint_url);
    const sendEcashResponse = {
      sentAmount: result.sentAmount,
      keepAmount: result.keepAmount,
      cashuToken: result.cashuToken,
      proofCount: result.sentProofs.length,
      timestamp: new Date().toISOString(),
    };
    
    return {
      structuredContent: sendEcashResponse,
      content: [
        {
          type: "text",
          text: JSON.stringify(sendEcashResponse, null, 2),
        },
      ],
    };
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
    },
    outputSchema: LookupInvoiceOutputSchema.shape,
  },
  async ({ payment_hash }) => {
    try {
      const quoteId = payment_hash;

      if (!quoteId) {
        throw new Error("Either payment_hash or invoice must be provided");
      }

      const result = await walletService.checkMintQuote(quoteId);
      const lookupResponse = formatNWCResponse("lookup_invoice", {
        isPaid: result.isPaid,
        isIssued: result.isIssued,
        payment_hash: result.quoteId,
        amount: result.amount,
      });

      return {
        structuredContent: lookupResponse,
        content: [
          {
            type: "text",
            text: JSON.stringify(lookupResponse, null, 2),
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
    outputSchema: GetInfoOutputSchema.shape,
  },
  async () => {
    try {
      const lud06Info = walletService.getLUD06Info();
      const infoResponse = formatNWCResponse("get_info", lud06Info);

      return {
        structuredContent: infoResponse,
        content: [
          {
            type: "text",
            text: JSON.stringify(infoResponse, null, 2),
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

console.log("Allowed public keys:", allowedPublicKeys);

const transport = new NostrServerTransport({
  relayHandler: new ApplesauceRelayPool(relayUrls),
  signer: new PrivateKeySigner(serverPrivateKey),
  // allowedPublicKeys: allowedPublicKeys,
  // excludedCapabilities: [
  //   {
  //     method: "tools/call",
  //     name: "make_invoice",
  //   },
  //   {
  //     method: "tools/call",
  //     name: "get_info",
  //   },
  //   {
  //     method: "tools/call",
  //     name: "lookup_invoice",
  //   },
  //   {
  //     method: "tools/list",
  //   },
  // ],
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
