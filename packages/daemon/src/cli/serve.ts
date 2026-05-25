import { BridgeWebSocketServer } from "../bridge/websocket-server.js";
import { PairingManager } from "../bridge/pairing.js";
import { AuthManager } from "../bridge/auth.js";
import { PermissionManager } from "../policy/permissions.js";
import { SessionManager } from "../session/session-manager.js";
import { TabLeaseManager } from "../session/tab-lease.js";
import { RequestQueue } from "../session/request-queue.js";
import { logger } from "../diagnostics/logger.js";
import type { EventPayload } from "@openbridge-org/shared";
import { BridgeController } from "../service/bridge-controller.js";
import { LocalApiServer } from "../service/local-api-server.js";
import { DATA_DIR, DEFAULT_API_PORT, DEFAULT_WS_PORT, LOG_FILE, ROOT_DIR } from "../runtime/paths.js";
import { clearRuntimeState, writeRuntimeState } from "../runtime/runtime-state.js";

export async function serveCommand(options?: { port?: number; apiPort?: number }): Promise<void> {
  const pairingManager = new PairingManager(DATA_DIR);
  const authManager = new AuthManager(pairingManager);
  const permissionManager = new PermissionManager();
  const sessionManager = new SessionManager();
  const tabLeaseManager = new TabLeaseManager();
  const requestQueue = new RequestQueue();

  const wsServer = new BridgeWebSocketServer(pairingManager, authManager, {
    port: options?.port || DEFAULT_WS_PORT,
  });
  const controller = new BridgeController(
    wsServer,
    permissionManager,
    tabLeaseManager,
    requestQueue,
  );
  const localApiServer = new LocalApiServer(controller, {
    port: options?.apiPort || DEFAULT_API_PORT,
  });

  let cleanupTimer: ReturnType<typeof tabLeaseManager.startCleanupInterval> | undefined;

  wsServer.on("log", (level: string, ...args: unknown[]) => {
    const fn = logger[level as "debug" | "info" | "warn" | "error"];
    if (typeof fn === "function") fn.call(logger, ...args);
  });

  wsServer.on("extension-connected", (sessionId: string) => {
    logger.info("Extension connected:", sessionId);
    sessionManager.createSession({ sessionId });
    if (!cleanupTimer) {
      cleanupTimer = tabLeaseManager.startCleanupInterval();
    }
  });

  wsServer.on("extension-disconnected", (sessionId: string) => {
    logger.info("Extension disconnected:", sessionId);
    sessionManager.destroySession(sessionId);
    tabLeaseManager.releaseAllBySession(sessionId);
  });

  wsServer.on("event", (payload: EventPayload) => {
    if (payload.eventType === "tab_closed") {
      const tabId = payload.details?.tabId;
      if (typeof tabId === "number") {
        tabLeaseManager.onTabClosed(tabId);
      }
    }

    if (payload.eventType === "config_changed") {
      const key = payload.details?.key;
      const value = payload.details?.value;
      if (key === "paused" && typeof value === "boolean") {
        controller.setPaused(value);
      }
      if (key === "evaluate_enabled" && typeof value === "boolean") {
        if (value) {
          permissionManager.enableTool("browser_evaluate");
        } else {
          permissionManager.disableTool("browser_evaluate");
        }
      }
    }
  });

  await wsServer.start();
  await localApiServer.start();
  writeRuntimeState({
    pid: process.pid,
    host: "127.0.0.1",
    wsPort: wsServer.getPort(),
    apiPort: localApiServer.getPort(),
    startedAt: new Date().toISOString(),
    rootDir: ROOT_DIR,
    logFile: LOG_FILE,
  });

  logger.info("OpenBridge runtime data directory", DATA_DIR);
  logger.info("OpenBridge daemon is running on WebSocket port", wsServer.getPort());
  logger.info("OpenBridge local API is running on port", localApiServer.getPort());

  const shutdown = async () => {
    logger.info("Shutting down...");
    if (cleanupTimer) {
      tabLeaseManager.stopCleanupInterval(cleanupTimer);
    }
    requestQueue.clear();
    await localApiServer.stop();
    await wsServer.stop();
    clearRuntimeState(process.pid);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
