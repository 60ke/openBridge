import { BridgeWebSocketServer } from "../bridge/websocket-server.js";
import { PairingManager } from "../bridge/pairing.js";
import { AuthManager } from "../bridge/auth.js";
import { PermissionManager } from "../policy/permissions.js";
import { SessionManager } from "../session/session-manager.js";
import { TabLeaseManager } from "../session/tab-lease.js";
import { RequestQueue } from "../session/request-queue.js";
import { logger } from "../diagnostics/logger.js";
import type { EventPayload } from "@openbridge/shared";
import { BridgeController } from "../service/bridge-controller.js";
import { LocalApiServer } from "../service/local-api-server.js";

export async function serveCommand(options?: { port?: number; apiPort?: number }): Promise<void> {
  const pairingManager = new PairingManager();
  const authManager = new AuthManager(pairingManager);
  const permissionManager = new PermissionManager();
  const sessionManager = new SessionManager();
  const tabLeaseManager = new TabLeaseManager();
  const requestQueue = new RequestQueue();

  const wsServer = new BridgeWebSocketServer(pairingManager, authManager, {
    port: options?.port || 10087,
  });
  const controller = new BridgeController(
    wsServer,
    permissionManager,
    tabLeaseManager,
    requestQueue,
  );
  const localApiServer = new LocalApiServer(controller, {
    port: options?.apiPort || 10088,
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

  logger.info("OpenBridge daemon is running on WebSocket port", wsServer["port"]);
  logger.info("OpenBridge local API is running on port", localApiServer.getPort());

  const shutdown = async () => {
    logger.info("Shutting down...");
    if (cleanupTimer) {
      tabLeaseManager.stopCleanupInterval(cleanupTimer);
    }
    requestQueue.clear();
    await localApiServer.stop();
    await wsServer.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
