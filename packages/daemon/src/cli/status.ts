import WebSocket from "ws";
import { PairingManager } from "../bridge/pairing.js";
import { LocalApiClient } from "../service/local-api-client.js";
import { DATA_DIR, DEFAULT_WS_PORT } from "../runtime/paths.js";
import { isPidRunning, readRuntimeState } from "../runtime/runtime-state.js";

export async function statusCommand(): Promise<void> {
  const runtime = readRuntimeState();
  if (!runtime) {
    console.log("Daemon: Not running (no runtime.json)");
  } else if (!isPidRunning(runtime.pid)) {
    console.log(`Daemon: Stale runtime state (PID ${runtime.pid} is not running)`);
  } else {
    console.log(`Daemon: Running (PID ${runtime.pid})`);
    console.log(`WebSocket: ws://${runtime.host}:${runtime.wsPort}/bridge`);
    console.log(`Local API: http://${runtime.host}:${runtime.apiPort}`);
    if (runtime.startedAt) console.log(`Started at: ${runtime.startedAt}`);
    console.log(`Log file: ${runtime.logFile}`);
  }

  const pairingManager = new PairingManager(DATA_DIR);
  const isPaired = pairingManager.isPaired();
  console.log("Pairing:", isPaired ? "Paired" : "Not paired");

  try {
    const api = new LocalApiClient(runtime?.apiPort);
    const health = await api.health();
    const sessions = health.connectedSessions;
    const sessionCount = Array.isArray(sessions) ? sessions.length : 0;
    console.log(`Extension: ${sessionCount > 0 ? `Connected (${sessionCount})` : "Not connected"}`);
  } catch {
    const running = await checkDaemonRunning(runtime?.wsPort ?? DEFAULT_WS_PORT);
    if (running) {
      console.log(`Extension: Cannot query local API, but WebSocket is reachable on ${running}`);
    } else {
      console.log("Extension: Not connected");
    }
  }
}

function checkDaemonRunning(basePort: number): Promise<number | false> {
  return new Promise((resolve) => {
    let settled = false;
    let pending = 11;

    for (let offset = 0; offset <= 10; offset++) {
      const port = basePort + offset;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
      const timeout = setTimeout(() => {
        ws.close();
      }, 1500);

      ws.on("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        ws.close();
        resolve(port);
      });

      ws.on("error", () => {
        clearTimeout(timeout);
        pending -= 1;
        if (!settled && pending === 0) {
          settled = true;
          resolve(false);
        }
      });

      ws.on("close", () => {
        clearTimeout(timeout);
      });
    }
  });
}
