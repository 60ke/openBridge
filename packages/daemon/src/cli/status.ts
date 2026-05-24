import WebSocket from "ws";
import { PairingManager } from "../bridge/pairing.js";
import { LocalApiClient } from "../service/local-api-client.js";

export async function statusCommand(): Promise<void> {
  const running = await checkDaemonRunning();
  if (!running) {
    console.log("Daemon is not running");
  } else {
    console.log("Daemon is running on port", running);
  }

  const pairingManager = new PairingManager();
  const isPaired = pairingManager.isPaired();
  console.log("Pairing status:", isPaired ? "Paired" : "Not paired");

  try {
    const api = new LocalApiClient();
    const health = await api.health();
    const apiPort = health.port;
    console.log("Local API:", typeof apiPort === "number" ? `Running on port ${apiPort}` : "Running");
  } catch {
    console.log("Local API: Not reachable");
  }
}

function checkDaemonRunning(): Promise<number | false> {
  return new Promise((resolve) => {
    let settled = false;
    let pending = 11;

    for (let port = 10087; port <= 10097; port++) {
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
