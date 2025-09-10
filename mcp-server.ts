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

// // multi_pay_invoice - NWC format
// server.registerTool(
//   "multi_pay_invoice",
//   {
//     title: "Pay Multiple Invoices (NWC)",
//     description: "Pay multiple Lightning invoices in NWC API format",
//     inputSchema: {
//       invoices: z.array(z.object({
//         id: z.string().optional(),
//         invoice: z.string().min(1, "Lightning invoice is required"),
//         amount: z.number().optional(),
//       })).min(1, "At least one invoice is required"),
//     },
//   },
//   async ({ invoices }) => {
//     const results = [];

//     for (const invoiceData of invoices) {
//       try {
//         const result = await walletService.payInvoice(invoiceData.invoice);
//         results.push({
//           id: invoiceData.id || result.meltQuoteId,
//           success: true,
//           response: formatNWCResponse("multi_pay_invoice", {
//             preimage: result.paymentPreimage || "",
//             fees_paid: result.feeReserve || 0,
//           })
//         });
//       } catch (error: any) {
//         results.push({
//           id: invoiceData.id || invoiceData.invoice.substring(0, 10),
//           success: false,
//           error: formatNWCError("PAYMENT_FAILED", error.message)
//         });
//       }
//     }

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({ results }, null, 2),
//         },
//       ],
//     };
//   },
// );

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

// Existing tools (kept for backward compatibility)

// // Balance Tool
// server.registerTool(
//   "get-balance",
//   {
//     title: "Get Wallet Balance",
//     description:
//       "Check the current wallet balance including pending transactions",
//     inputSchema: {},
//   },
//   async () => {
//     const result = await walletService.getBalance();
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(
//             {
//               balance: result.balance,
//               pendingBalance: result.pendingBalance,
//               total: result.total,
//               pendingProofsCount: result.pendingProofsCount,
//               timestamp: new Date().toISOString(),
//             },
//             null,
//             2,
//           ),
//         },
//       ],
//     };
//   },
// );

// // Mint Quote Tool
// // TODO: await to mint tokens automatically after create the mint quote
// // PUBLIC
// server.registerTool(
//   "create-mint-quote",
//   {
//     title: "Create Mint Quote",
//     description: "Create a mint quote for a specified amount to receive eCash",
//     inputSchema: {
//       amount: z.number().positive("Amount must be positive"),
//     },
//   },
//   async ({ amount }) => {
//     const result = await walletService.createMintQuote(amount);
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(
//             {
//               quoteId: result.quoteId,
//               lightningInvoice: result.lightningInvoice,
//               amount: result.amount,
//               expiry: result.expiry,
//               timestamp: new Date().toISOString(),
//             },
//             null,
//             2,
//           ),
//         },
//       ],
//     };
//   },
// );

// // Check Mint Quote Tool
// // This should not be necessary, but can be called in the background automatically to redeem paid quotes
// server.registerTool(
//   "check-mint-quote",
//   {
//     title: "Check Mint Quote Status",
//     description: "Check the status of a mint quote",
//     inputSchema: {
//       quoteId: z.string().min(1, "Quote ID is required"),
//     },
//   },
//   async ({ quoteId }) => {
//     const result = await walletService.checkMintQuote(quoteId);
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(
//             {
//               quoteId: result.quoteId,
//               state: result.state,
//               amount: result.amount,
//               isPaid: result.isPaid,
//               isIssued: result.isIssued,
//               canMint: result.canMint,
//               timestamp: new Date().toISOString(),
//             },
//             null,
//             2,
//           ),
//         },
//       ],
//     };
//   },
// );

// // Mint Proofs Tool
// server.registerTool(
//   "mint-proofs",
//   {
//     title: "Mint Proofs",
//     description: "Mint eCash proofs from a paid mint quote",
//     inputSchema: {
//       quoteId: z.string().min(1, "Quote ID is required"),
//       amount: z.number().positive("Amount must be positive"),
//     },
//   },
//   async ({ quoteId, amount }) => {
//     const result = await walletService.mintProofs(quoteId, amount);
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(
//             {
//               quoteId: result.quoteId,
//               totalAmount: result.totalAmount,
//               proofCount: result.proofCount,
//               proofAmounts: result.proofAmounts,
//               timestamp: new Date().toISOString(),
//             },
//             null,
//             2,
//           ),
//         },
//       ],
//     };
//   },
// );

// // Send eCash Tool
// server.registerTool(
//   "send-ecash",
//   {
//     title: "Send eCash",
//     description: "Create an eCash token",
//     inputSchema: {
//       amount: z.number().positive("Amount must be positive"),
//     },
//   },
//   async ({ amount }) => {
//     const result = await walletService.sendEcash(amount);
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(
//             {
//               sentAmount: result.sentAmount,
//               keepAmount: result.keepAmount,
//               cashuToken: result.cashuToken,
//               proofCount: result.sentProofs.length,
//               timestamp: new Date().toISOString(),
//             },
//             null,
//             2,
//           ),
//         },
//       ],
//     };
//   },
// );

// // Receive eCash Tool
// // PUBLIC
// server.registerTool(
//   "receive-ecash",
//   {
//     title: "Receive eCash",
//     description: "Receive eCash from a Cashu token",
//     inputSchema: {
//       token: z.string().min(1, "Cashu token is required"),
//     },
//   },
//   async ({ token }) => {
//     const result = await walletService.receiveEcash(token);
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(
//             {
//               totalAmount: result.totalAmount,
//               proofCount: result.proofCount,
//               proofAmounts: result.proofAmounts,
//               timestamp: new Date().toISOString(),
//             },
//             null,
//             2,
//           ),
//         },
//       ],
//     };
//   },
// );

// // Mint eCash (One-step) Tool
// server.registerTool(
//   "mint-ecash",
//   {
//     title: "Mint eCash",
//     description:
//       "Mint eCash in one step - creates quote, waits for payment, and mints automatically",
//     inputSchema: {
//       amount: z.number().positive("Amount must be positive"),
//     },
//   },
//   async ({ amount }, { sendNotification, _meta }) => {
//     const progressToken = _meta?.progressToken;

//     try {
//       const createMint = await walletService.createMintQuote(amount);

//       // Send Lightning invoice as notification
//       if (progressToken) {
//         sendNotification({
//           method: "notifications/progress",
//           params: {
//             progressToken,
//             progress: 1,
//             total: 1,
//             message: createMint.lightningInvoice,
//           },
//         });
//       }

//       let attempts = 0;
//       const maxAttempts = 60; // 5 minutes with 5-second intervals
//       let paid = false;

//       while (attempts < maxAttempts && !paid) {
//         await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

//         const quoteStatus = await walletService.checkMintQuote(
//           createMint.quoteId,
//         );

//         if (quoteStatus.isPaid) {
//           paid = true;
//         } else if (quoteStatus.isIssued) {
//           throw new Error("Quote has already been issued.");
//         } else {
//           attempts++;
//         }
//       }

//       if (!paid) {
//         throw new Error("Timeout waiting for payment. Please try again later.");
//       }

//       const mintResult = await walletService.mintProofs(
//         createMint.quoteId,
//         amount,
//       );

//       return {
//         content: [
//           {
//             type: "text",
//             text: JSON.stringify(
//               {
//                 quoteId: createMint.quoteId,
//                 lightningInvoice: createMint.lightningInvoice,
//                 totalAmount: mintResult.totalAmount,
//                 proofCount: mintResult.proofCount,
//                 proofAmounts: mintResult.proofAmounts,
//                 timestamp: new Date().toISOString(),
//                 status: "success",
//               },
//               null,
//               2,
//             ),
//           },
//         ],
//       };
//     } catch (error: any) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: JSON.stringify(
//               {
//                 error: true,
//                 message: error.message,
//                 timestamp: new Date().toISOString(),
//               },
//               null,
//               2,
//             ),
//           },
//         ],
//       };
//     }
//   },
// );

// // Pay Lightning Invoice Tool
// server.registerTool(
//   "pay-invoice",
//   {
//     title: "Pay Lightning Invoice",
//     description: "Pay a Lightning invoice using eCash balance",
//     inputSchema: {
//       invoice: z.string().min(1, "Lightning invoice is required"),
//     },
//   },
//   async ({ invoice }) => {
//     const result = await walletService.payInvoice(invoice);
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(
//             {
//               meltQuoteId: result.meltQuoteId,
//               amountPaid: result.amountPaid,
//               feeReserve: result.feeReserve,
//               totalAmount: result.totalAmount,
//               remainingBalance: result.remainingBalance,
//               paymentPreimage: result.paymentPreimage,
//               timestamp: new Date().toISOString(),
//             },
//             null,
//             2,
//           ),
//         },
//       ],
//     };
//   },
// );

// // Get Wallet Info Tool
// server.registerTool(
//   "get-wallet-info",
//   {
//     title: "Get Wallet Information",
//     description: "Get basic wallet configuration information",
//     inputSchema: {},
//   },
//   async () => {
//     const result = await walletService.getInfo();
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(
//             {
//               mintUrl: result.mintUrl,
//               walletDbPath: result.walletDbPath,
//               unit: result.unit,
//               timestamp: new Date().toISOString(),
//             },
//             null,
//             2,
//           ),
//         },
//       ],
//     };
//   },
// );

// const transport = new StdioServerTransport();
const transport = new NostrServerTransport({
  relayHandler: new ApplesauceRelayPool(["ws://localhost:10547"]),
  signer: new PrivateKeySigner(
    "89b0a67e0dcd450b14af2f1139856dc79b147f772b144d16f21c496f624388ab",
  ),
  // allowedPublicKeys: ["145bebf934e7f5605539ca73e31ddec74da38eb847d7316faeba125f52ec1c70"],
  // excludedCapabilities: [
  //   {
  //     method: "tools/call",
  //     name: "mint-ecash",
  //   },
  //   {
  //     method: "tools/list",
  //   }
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
