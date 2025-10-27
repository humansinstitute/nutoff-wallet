import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { randomBytes } from "crypto";

const root = resolve(".");
const exampleEnvPath = resolve(root, "example.env");
const envPath = resolve(root, ".env");

if (!existsSync(exampleEnvPath)) {
  console.error("example.env not found. Ensure you are running this from the repository root.");
  process.exit(1);
}

// Ensure scripts directory exists when executed via transpiled output
const scriptsDir = resolve(root, "scripts");
if (!existsSync(scriptsDir)) {
  mkdirSync(scriptsDir, { recursive: true });
}

// Copy example.env to .env (overwrites existing to guarantee a clean baseline)
copyFileSync(exampleEnvPath, envPath);

let envContents = readFileSync(envPath, "utf-8");

const privateKey = randomBytes(32).toString("hex");

// Set SERVER_PRIVATE_KEY
if (envContents.match(/^\s*SERVER_PRIVATE_KEY=.*$/m)) {
  envContents = envContents.replace(/^\s*SERVER_PRIVATE_KEY=.*$/m, `SERVER_PRIVATE_KEY=${privateKey}`);
} else {
  envContents += `\nSERVER_PRIVATE_KEY=${privateKey}\n`;
}

// Set MINT_URL
if (envContents.match(/^\s*MINT_URL=.*$/m)) {
  envContents = envContents.replace(/^\s*MINT_URL=.*$/m, "MINT_URL=https://mint.minibits.cash/Bitcoin");
} else {
  envContents += "\nMINT_URL=https://mint.minibits.cash/Bitcoin\n";
}

// Ensure CASHU_WALLET_DB is uncommented and set
if (envContents.match(/^\s*#\s*CASHU_WALLET_DB=.*$/m)) {
  envContents = envContents.replace(/^\s*#\s*CASHU_WALLET_DB=.*$/m, "CASHU_WALLET_DB=./wallet.sqlite");
} else if (envContents.match(/^\s*CASHU_WALLET_DB=.*$/m)) {
  envContents = envContents.replace(/^\s*CASHU_WALLET_DB=.*$/m, "CASHU_WALLET_DB=./wallet.sqlite");
} else {
  envContents += "\nCASHU_WALLET_DB=./wallet.sqlite\n";
}

// Ensure NOSTR_RELAYS comments and value are set
const nostrRelayCommentBlock = "# Nostr relay URLs (comma-separated list)\n# Example: NOSTR_RELAYS=wss://relay.contextvm.org";
if (envContents.includes("# Nostr relay URLs (comma-separated list)")) {
  envContents = envContents.replace(
    /# Nostr relay URLs \(comma-separated list\)\s*\n# Example: NOSTR_RELAYS=.*$/m,
    nostrRelayCommentBlock,
  );
} else {
  envContents += `\n${nostrRelayCommentBlock}\n`;
}

if (envContents.match(/^\s*NOSTR_RELAYS=.*$/m)) {
  envContents = envContents.replace(/^\s*NOSTR_RELAYS=.*$/m, "NOSTR_RELAYS=wss://relay.contextvm.org");
} else {
  envContents += "\nNOSTR_RELAYS=wss://relay.contextvm.org\n";
}

writeFileSync(envPath, envContents);

console.log(".env configured:");
console.log(`- MINT_URL set to https://mint.minibits.cash/Bitcoin`);
console.log(`- CASHU_WALLET_DB set to ./wallet.sqlite`);
console.log(`- NOSTR_RELAYS set to wss://relay.contextvm.org`);
console.log("- SERVER_PRIVATE_KEY generated (not displayed for security).");
console.log("Setup complete.");
