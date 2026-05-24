import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

interface NetworkEvent {
  type: "request" | "response" | "loadingFailed";
  requestId?: string;
  url?: string;
  method?: string;
  status?: number;
  mimeType?: string;
  errorText?: string;
  timestamp: number;
}

const MAX_BUFFER_SIZE = 500;

const tabBuffers = new Map<number, NetworkEvent[]>();
const tabListeners = new Map<number, boolean>();

function getBuffer(tabId: number): NetworkEvent[] {
  if (!tabBuffers.has(tabId)) {
    tabBuffers.set(tabId, []);
  }
  return tabBuffers.get(tabId)!;
}

function pushEvent(tabId: number, event: NetworkEvent): void {
  const buffer = getBuffer(tabId);
  buffer.push(event);
  while (buffer.length > MAX_BUFFER_SIZE) {
    buffer.shift();
  }
}

export class NetworkHandler implements ToolHandler {
  name = "browser_network";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    if (cdpExecutor.activeTabId == null) {
      return {
        error: {
          code: "TAB_NOT_FOUND",
          message: "No active tab attached to debugger",
        },
      };
    }

    const tabId = cdpExecutor.activeTabId;
    const action = (args.action as string) ?? "get";

    if (action === "start") {
      if (tabListeners.get(tabId)) {
        return { data: { status: "already_listening", tabId } };
      }

      await cdpExecutor.sendCommand("Network.enable");

      chrome.debugger.onEvent.addListener((source, method, params: any) => {
        if (source.tabId !== tabId) return;

        if (method === "Network.requestWillBeSent") {
          pushEvent(tabId, {
            type: "request",
            requestId: params.requestId,
            url: params.request?.url,
            method: params.request?.method,
            timestamp: params.wallTime ?? Date.now(),
          });
        } else if (method === "Network.responseReceived") {
          pushEvent(tabId, {
            type: "response",
            requestId: params.requestId,
            url: params.response?.url,
            status: params.response?.status,
            mimeType: params.response?.mimeType,
            timestamp: params.wallTime ?? Date.now(),
          });
        } else if (method === "Network.loadingFailed") {
          pushEvent(tabId, {
            type: "loadingFailed",
            requestId: params.requestId,
            errorText: params.errorText,
            timestamp: Date.now(),
          });
        }
      });

      tabListeners.set(tabId, true);
      return { data: { status: "started", tabId } };
    }

    if (action === "get") {
      const limit = (args.limit as number) ?? 100;
      const buffer = getBuffer(tabId);
      const events = buffer.slice(-limit);
      return { data: { events, count: events.length, tabId } };
    }

    if (action === "clear") {
      tabBuffers.set(tabId, []);
      return { data: { status: "cleared", tabId } };
    }

    return {
      error: {
        code: "INVALID_PARAMS",
        message: `Unknown action: ${action}. Use start, get, or clear.`,
      },
    };
  }
}
