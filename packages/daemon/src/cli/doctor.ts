import net from "node:net";
import WebSocket from "ws";
import { PairingManager } from "../bridge/pairing.js";
import { LocalApiClient } from "../service/local-api-client.js";

export async function doctorCommand(options?: { port?: number; apiPort?: number }): Promise<void> {
  const port = options?.port ?? 10087;
  const apiPort = options?.apiPort ?? 10088;
  const results: { label: string; ok: boolean; detail?: string }[] = [];

  const nodeVersion = process.version;
  results.push({
    label: "Node.js version",
    ok: true,
    detail: nodeVersion,
  });

  const portAvailable = await checkPortAvailable(port);
  results.push({
    label: `WebSocket port ${port} available`,
    ok: portAvailable,
    detail: portAvailable ? "Available" : "In use (another local service may be running)",
  });

  const pairingManager = new PairingManager();
  const isPaired = pairingManager.isPaired();
  results.push({
    label: "Pairing status",
    ok: isPaired,
    detail: isPaired ? "Paired" : "Not paired (run 'openbridge pair')",
  });

  const daemonRunning = await checkDaemonRunning(port);
  results.push({
    label: "OpenBridge daemon reachable",
    ok: daemonRunning,
    detail: daemonRunning ? `Running on port ${port}` : "Not running",
  });

  if (daemonRunning) {
    const localApiHealthy = await checkLocalApi(apiPort);
    results.push({
      label: "Local API reachable",
      ok: localApiHealthy !== false,
      detail: localApiHealthy ? `Running on port ${localApiHealthy}` : "Not reachable",
    });

    const extensionConnected = await checkExtensionConnected(port);
    results.push({
      label: "Extension handshake working",
      ok: extensionConnected,
      detail: extensionConnected ? "Connected" : "Not connected",
    });
  }

  console.log("\nOpenBridge Doctor\n");
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const detail = r.detail ? ` (${r.detail})` : "";
    console.log(`  ${icon} ${r.label}${detail}`);
  }
  console.log();
}

async function checkLocalApi(port: number): Promise<number | false> {
  try {
    const client = new LocalApiClient(port);
    const result = await client.health();
    const returnedPort = result.port;
    return typeof returnedPort === "number" ? returnedPort : port;
  } catch {
    return false;
  }
}

function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function checkDaemonRunning(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 2000);
    ws.on("open", () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });
    ws.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

function checkExtensionConnected(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 3000);
    ws.on("open", () => {
      const hello = {
        type: "hello",
        payload: { version: "0.1.0", sessionId: "doctor-check-" + Date.now() },
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(hello));
    });
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "pair_challenge" || msg.type === "hello_ack") {
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        }
      } catch {}
    });
    ws.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}
