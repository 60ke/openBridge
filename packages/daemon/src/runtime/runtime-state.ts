import fs from "node:fs";
import { DATA_DIR, DEFAULT_API_PORT, DEFAULT_HOST, DEFAULT_WS_PORT, LOG_FILE, PID_FILE, RUNTIME_FILE, ROOT_DIR } from "./paths.js";

export interface RuntimeState {
  pid: number;
  host: string;
  wsPort: number;
  apiPort: number;
  startedAt: string;
  rootDir: string;
  logFile: string;
}

export function readRuntimeState(): RuntimeState | null {
  try {
    const raw = fs.readFileSync(RUNTIME_FILE, "utf-8");
    const state = JSON.parse(raw) as Partial<RuntimeState>;
    if (
      typeof state.pid !== "number" ||
      typeof state.wsPort !== "number" ||
      typeof state.apiPort !== "number"
    ) {
      return null;
    }
    return {
      pid: state.pid,
      host: state.host ?? DEFAULT_HOST,
      wsPort: state.wsPort,
      apiPort: state.apiPort,
      startedAt: state.startedAt ?? "",
      rootDir: state.rootDir ?? ROOT_DIR,
      logFile: state.logFile ?? LOG_FILE,
    };
  } catch {
    return null;
  }
}

export function writeRuntimeState(state: RuntimeState): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${RUNTIME_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmpPath, RUNTIME_FILE);
  fs.writeFileSync(PID_FILE, `${state.pid}\n`, "utf-8");
}

export function clearRuntimeState(pid?: number): void {
  const state = readRuntimeState();
  if (pid && state && state.pid !== pid) {
    return;
  }
  for (const file of [RUNTIME_FILE, PID_FILE]) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
}

export function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readRuntimeApiPort(): number | undefined {
  const envPort = parsePort(process.env.OPENBRIDGE_API_PORT);
  if (envPort) return envPort;

  const state = readRuntimeState();
  if (state && isPidRunning(state.pid)) {
    return state.apiPort;
  }
  return undefined;
}

export function readRuntimeWsPort(): number | undefined {
  const envPort = parsePort(process.env.OPENBRIDGE_WS_PORT);
  if (envPort) return envPort;

  const state = readRuntimeState();
  if (state && isPidRunning(state.pid)) {
    return state.wsPort;
  }
  return undefined;
}

export function getDefaultApiPort(): number {
  return readRuntimeApiPort() ?? DEFAULT_API_PORT;
}

export function getDefaultWsPort(): number {
  return readRuntimeWsPort() ?? DEFAULT_WS_PORT;
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : undefined;
}
