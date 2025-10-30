import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
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

const cleanStalePidFile = (pid: number) => {
  if (isProcessRunning(pid)) {
    console.error(`Server already running with PID ${pid}. Use "bun run stop" before starting again.`);
    process.exit(1);
  }

  try {
    unlinkSync(pidPath);
    console.warn("Removed stale cashu-server.pid file.");
  } catch (error) {
    console.warn("Unable to remove stale cashu-server.pid file:", error);
  }
};

if (existsSync(pidPath)) {
  const rawPid = readFileSync(pidPath, "utf-8").trim();
  const pid = Number.parseInt(rawPid, 10);
  if (!Number.isNaN(pid)) {
    cleanStalePidFile(pid);
  } else {
    unlinkSync(pidPath);
  }
}

const serverProcess = Bun.spawn(["bun", "run", "--bun", "mcp-server.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});

if (!serverProcess?.pid) {
  console.error("Failed to launch server process.");
  process.exit(1);
}

writeFileSync(pidPath, `${serverProcess.pid}`);
console.log(`Server started (PID ${serverProcess.pid}).`);

const exitCode = await serverProcess.exited;

if (existsSync(pidPath)) {
  unlinkSync(pidPath);
}

if (exitCode !== 0) {
  console.error(`Server exited with code ${exitCode}.`);
}

process.exit(exitCode);
