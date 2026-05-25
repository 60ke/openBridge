import { BridgeWsClient } from "../src/background/ws-client";
import { ReconnectManager } from "../src/background/reconnect";
import { CommandRouter } from "../src/background/command-router";
import { toolHandlers } from "../src/background/tool-registry";
import { cdpExecutor } from "../src/background/cdp-executor";
import type { CommandPayload, CommandResultPayload, ErrorPayload } from "@openbridge/shared";

export const wsClient = new BridgeWsClient();
export const reconnectManager = new ReconnectManager(wsClient);

const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:10087/bridge";

async function addRecentOperation(name: string): Promise<void> {
  const result = await chrome.storage.local.get(["recent_operations"]);
  const operations: Array<{ name: string; timestamp: number }> = result.recent_operations ?? [];
  operations.push({ name, timestamp: Date.now() });
  while (operations.length > 20) {
    operations.shift();
  }
  await chrome.storage.local.set({ recent_operations: operations });
}

async function sendToActiveTab(message: Record<string, unknown>): Promise<void> {
  const tabId = cdpExecutor.activeTabId;
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {}
}

export default defineBackground(() => {
  console.log("OpenBridge background service worker loaded");

  const router = new CommandRouter(wsClient);
  for (const handler of toolHandlers) {
    router.registerTool(handler);
  }
  router.setup();

  router.onResult = (command: CommandPayload, result: CommandResultPayload) => {
    if (command.name === "browser_click" && result.data) {
      const data = result.data as { x?: number; y?: number };
      if (data.x != null && data.y != null) {
        sendToActiveTab({ type: "clickCursor", x: data.x, y: data.y });
      }
    }
    if (command.name === "browser_snapshot" && result.data) {
      const data = result.data as { snapshot?: Array<{ role?: string; ref?: number }> };
      if (data.snapshot) {
        const interactiveRoles = new Set([
          "button", "link", "textbox", "combobox", "checkbox",
          "radio", "slider", "tab", "menuitem", "treeitem",
        ]);
        sendToActiveTab({ type: "clearHighlights" });
        for (const node of data.snapshot) {
          if (node.role && interactiveRoles.has(node.role) && node.ref != null) {
            sendToActiveTab({ type: "highlightElement", ref: String(node.ref) });
          }
        }
      }
    }
  };

  wsClient.on("connected", () => {
    console.log("[OpenBridge] Connected to bridge server");
    reconnectManager.saveState({
      url: wsClient.currentUrl,
      shouldReconnect: true,
    });
  });

  wsClient.on("error", (payload: unknown) => {
    const error = payload as ErrorPayload;
    const detail =
      error && typeof error === "object"
        ? `${error.code ?? "UNKNOWN"}${error.message ? ` - ${error.message}` : ""}`
        : String(payload);
    console.error(`[OpenBridge] Server error: ${detail}`);
  });

  wsClient.on("pair-challenge", (payload: unknown) => {
    const challenge = payload as { challenge: string };
    if (challenge.challenge) {
      wsClient.confirmPairing(challenge.challenge);
    }
  });

  wsClient.on("command", (payload: unknown) => {
    const command = payload as { payload?: { name?: string } };
    const commandName = command.payload?.name;
    if (commandName) {
      addRecentOperation(commandName);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (wsClient.state !== "connected") return;
    wsClient.send({
      type: "event",
      payload: {
        eventType: "tab_closed",
        details: { tabId },
      },
      timestamp: Date.now(),
    });
  });

  chrome.debugger.onDetach.addListener((source, reason) => {
    if (wsClient.state !== "connected" || source.tabId == null) return;
    wsClient.send({
      type: "event",
      payload: {
        eventType: "debugger_detached",
        details: { tabId: source.tabId, reason },
      },
      timestamp: Date.now(),
    });
  });

  async function sendConfigEvent(key: "paused" | "evaluate_enabled", value: boolean): Promise<void> {
    if (wsClient.state !== "connected" || !wsClient.isAuthorized) return;
    try {
      wsClient.send({
        type: "event",
        payload: {
          eventType: "config_changed",
          details: { key, value },
        },
        timestamp: Date.now(),
      });
    } catch {}
  }

  chrome.storage.local.get(["paused", "evaluate_enabled"]).then((result) => {
    if (typeof result.paused === "boolean") {
      sendConfigEvent("paused", result.paused);
    }
    if (typeof result.evaluate_enabled === "boolean") {
      sendConfigEvent("evaluate_enabled", result.evaluate_enabled);
    }
  });

  wsClient.on("connected", async () => {
    const result = await chrome.storage.local.get(["paused", "evaluate_enabled"]);
    if (typeof result.paused === "boolean") {
      await sendConfigEvent("paused", result.paused);
    }
    if (typeof result.evaluate_enabled === "boolean") {
      await sendConfigEvent("evaluate_enabled", result.evaluate_enabled);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.paused) {
      sendConfigEvent("paused", !!changes.paused.newValue);
    }
    if (changes.evaluate_enabled) {
      sendConfigEvent("evaluate_enabled", !!changes.evaluate_enabled.newValue);
    }
  });

  chrome.storage.session.get("openbridge-connection-state").then((result) => {
    const state = result["openbridge-connection-state"] as { url?: string } | undefined;
    if (state?.url) {
      wsClient.setPreferredUrl(state.url);
    } else {
      wsClient.setPreferredUrl(DEFAULT_BRIDGE_URL);
    }
  });

  chrome.runtime.onMessage.addListener(
    (message: Record<string, unknown>, _sender: ChromeMessageSender, sendResponse: (response?: Record<string, unknown>) => void) => {
      const msg = message as { type: string; enabled?: boolean; paused?: boolean };

      switch (msg.type) {
        case "getStatus": {
          chrome.storage.local.get(["openbridge_token"]).then((result) => {
            const displayUrl = wsClient.url.replace(/\/bridge$/, "");
            const activeUrl = wsClient.currentUrl.replace(/\/bridge$/, "");
            sendResponse({
              transportConnected: wsClient.state === "connected",
              connected: wsClient.state === "connected" && wsClient.isAuthorized,
              paired: wsClient.isAuthorized,
              hasStoredToken: !!result.openbridge_token,
              autoPairing: wsClient.state === "connected" && !wsClient.isAuthorized,
              url: wsClient.state === "connected" ? activeUrl : displayUrl,
            });
          });
          return true;
        }
        case "pair": {
          wsClient.disconnect();
          wsClient.connect();
          sendResponse({ success: true });
          break;
        }
        case "resetPairing": {
          wsClient.clearToken();
          wsClient.disconnect();
          wsClient.connect();
          sendResponse({ success: true });
          break;
        }
        case "toggleEvaluate": {
          chrome.storage.local.set({ evaluate_enabled: !!msg.enabled });
          sendResponse({ success: true });
          break;
        }
        case "togglePause": {
          chrome.storage.local.set({ paused: !!msg.paused });
          sendResponse({ success: true });
          break;
        }
        default:
          sendResponse({ error: "Unknown message type" });
      }
      return false;
    }
  );

  reconnectManager.restoreOnWake().then(() => {
    if (wsClient.state === "disconnected") {
      wsClient.connect();
    }
  });

  reconnectManager.start();
});
