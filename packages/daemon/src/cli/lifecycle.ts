import fs from "node:fs";
import { execFileSync, execSync, spawn } from "node:child_process";
import { DEFAULT_API_PORT, DEFAULT_TMUX_SESSION, DEFAULT_WS_PORT, LOG_FILE, PID_FILE, ROOT_DIR } from "../runtime/paths.js";
import { clearRuntimeState, isPidRunning, readRuntimeState } from "../runtime/runtime-state.js";
import { statusCommand } from "./status.js";

interface LifecycleOptions {
  port?: number;
  apiPort?: number;
}

export async function startCommand(options: LifecycleOptions = {}): Promise<void> {
  const existing = readRuntimeState();
  if (existing && isPidRunning(existing.pid)) {
    console.log(`OpenBridge daemon is already running (PID ${existing.pid})`);
    console.log(`WebSocket: ws://${existing.host}:${existing.wsPort}/bridge`);
    console.log(`Local API: http://${existing.host}:${existing.apiPort}`);
    return;
  }

  fs.mkdirSync(`${ROOT_DIR}/.openbridge-data`, { recursive: true });
  const wsPort = options.port ?? parsePort(process.env.OPENBRIDGE_WS_PORT) ?? DEFAULT_WS_PORT;
  const apiPort = options.apiPort ?? parsePort(process.env.OPENBRIDGE_API_PORT) ?? DEFAULT_API_PORT;
  const cliPath = `${ROOT_DIR}/packages/daemon/dist/cli/index.js`;
  const args = ["serve", "--port", String(wsPort), "--api-port", String(apiPort)];

  stopTmuxSession();
  clearRuntimeState();

  if (hasCommand("tmux")) {
    const session = process.env.OPENBRIDGE_TMUX_SESSION || DEFAULT_TMUX_SESSION;
    const command = `cd '${ROOT_DIR}' && OPENBRIDGE_NO_MCP=1 node '${cliPath}' ${args.join(" ")} >>'${LOG_FILE}' 2>&1`;
    execFileSync("tmux", ["new-session", "-d", "-s", session, command], { stdio: "ignore" });
  } else {
    const out = fs.openSync(LOG_FILE, "a");
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: ROOT_DIR,
      detached: true,
      env: { ...process.env, OPENBRIDGE_NO_MCP: "1" },
      stdio: ["ignore", out, out],
    });
    child.unref();
    fs.writeFileSync(PID_FILE, `${child.pid}\n`, "utf-8");
  }

  await waitForRuntime();
  await statusCommand();
}

export async function stopCommand(): Promise<void> {
  const state = readRuntimeState();
  const session = process.env.OPENBRIDGE_TMUX_SESSION || DEFAULT_TMUX_SESSION;
  let stopped = false;

  if (hasCommand("tmux")) {
    try {
      execFileSync("tmux", ["kill-session", "-t", session], { stdio: "ignore" });
      stopped = true;
    } catch {}
  }

  if (state && isPidRunning(state.pid)) {
    try {
      process.kill(state.pid, "SIGTERM");
      stopped = true;
    } catch {}
  }

  await sleep(500);
  clearRuntimeState(state?.pid);
  console.log(stopped ? "OpenBridge daemon stopped" : "OpenBridge daemon was not running");
}

export async function restartCommand(options: LifecycleOptions = {}): Promise<void> {
  await stopCommand();
  await startCommand(options);
}

export async function logsCommand(options: { follow?: boolean } = {}): Promise<void> {
  const state = readRuntimeState();
  const logFile = state?.logFile ?? LOG_FILE;
  if (!fs.existsSync(logFile)) {
    console.log(`No log file found: ${logFile}`);
    return;
  }
  const args = options.follow ? ["-f", logFile] : ["-n", "120", logFile];
  const child = spawn("tail", args, { stdio: "inherit" });
  await new Promise<void>((resolve, reject) => {
    child.on("exit", () => resolve());
    child.on("error", reject);
  });
}

function stopTmuxSession(): void {
  if (!hasCommand("tmux")) return;
  const session = process.env.OPENBRIDGE_TMUX_SESSION || DEFAULT_TMUX_SESSION;
  try {
    execFileSync("tmux", ["kill-session", "-t", session], { stdio: "ignore" });
  } catch {}
}

function hasCommand(command: string): boolean {
  try {
    execSync(`command -v ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function waitForRuntime(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const state = readRuntimeState();
    if (state && isPidRunning(state.pid)) return;
    await sleep(250);
  }
  throw new Error(`OpenBridge daemon did not write runtime state. Check log: ${LOG_FILE}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : undefined;
}
