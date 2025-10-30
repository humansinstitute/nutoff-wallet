import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
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

const envExists = existsSync(envPath);

if (!envExists) {
  copyFileSync(exampleEnvPath, envPath);
}

let envContents = readFileSync(envPath, "utf-8");
const originalEnvContents = envContents;
const actions: string[] = [];

const ensureEnvValue = (key: string, value: string, options: { overwrite?: boolean; ensureUncomment?: boolean } = {}) => {
  const { overwrite = false, ensureUncomment = false } = options;
  const pattern = new RegExp(`^\\s*${key}=.*$`, "m");
  const commentedPattern = new RegExp(`^\\s*#\\s*${key}=.*$`, "m");

  if (envContents.match(pattern)) {
    if (overwrite) {
      envContents = envContents.replace(pattern, `${key}=${value}`);
      actions.push(`${key} set to ${value}`);
    }
  } else if (ensureUncomment && envContents.match(commentedPattern)) {
    envContents = envContents.replace(commentedPattern, `${key}=${value}`);
    actions.push(`${key} uncommented and set to ${value}`);
  } else {
    envContents += `\n${key}=${value}\n`;
    actions.push(`${key} added with default ${value}`);
  }
};

const serverKeyMatch = envContents.match(/^\s*SERVER_PRIVATE_KEY=(.*)$/m);
const existingPrivateKey = serverKeyMatch?.[1]?.trim();

if (!existingPrivateKey) {
  const privateKey = randomBytes(32).toString("hex");
  if (serverKeyMatch) {
    envContents = envContents.replace(/^\s*SERVER_PRIVATE_KEY=.*$/m, `SERVER_PRIVATE_KEY=${privateKey}`);
  } else {
    envContents += `\nSERVER_PRIVATE_KEY=${privateKey}\n`;
  }
  actions.push("SERVER_PRIVATE_KEY generated");
} else {
  actions.push("SERVER_PRIVATE_KEY preserved");
}

ensureEnvValue("MINT_URL", "https://mint.minibits.cash/Bitcoin");

// Ensure CASHU_WALLET_DB is uncommented and set
ensureEnvValue("CASHU_WALLET_DB", "./wallet.sqlite", { ensureUncomment: true });

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

ensureEnvValue("NOSTR_RELAYS", "wss://relay.contextvm.org", { overwrite: true });

if (envContents !== originalEnvContents) {
  writeFileSync(envPath, envContents);
}

console.log(".env configuration complete.");
console.log(envExists ? "- Existing .env preserved." : "- .env created from example.env.");
actions.forEach((action) => console.log(`- ${action}.`));
console.log("Setup complete.");
