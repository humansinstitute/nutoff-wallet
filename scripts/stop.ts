import { existsSync, readFileSync, unlinkSync } from "fs";
import { resolve } from "path";

const root = resolve(".");
const pidPath = resolve(root, "cashu-server.pid");

const isProcessRunning = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const err = error as { code?: string } | undefined;
    return (err?.code ?? "") !== "ESRCH";
  }
};

if (!existsSync(pidPath)) {
  console.log("No running server detected (cashu-server.pid not found).");
  process.exit(0);
}

const rawPid = readFileSync(pidPath, "utf-8").trim();
const pid = Number.parseInt(rawPid, 10);

if (Number.isNaN(pid)) {
  console.error("cashu-server.pid is corrupted. Removing file.");
  unlinkSync(pidPath);
  process.exit(1);
}

if (!isProcessRunning(pid)) {
  console.log("Server process not found. Removing stale PID file.");
  unlinkSync(pidPath);
  process.exit(0);
}

try {
  process.kill(pid, "SIGTERM");
  console.log(`Sent SIGTERM to server process ${pid}.`);
} catch (error) {
  console.error("Failed to signal server process:", error);
  process.exit(1);
}

let retries = 10;
const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

while (retries > 0) {
  if (!isProcessRunning(pid)) {
    break;
  }
  await sleep(100);
  retries -= 1;
}

if (isProcessRunning(pid)) {
  console.warn(`Process ${pid} did not exit after SIGTERM. You may need to stop it manually.`);
} else {
  console.log("Server stopped successfully.");
}

if (existsSync(pidPath)) {
  unlinkSync(pidPath);
}
