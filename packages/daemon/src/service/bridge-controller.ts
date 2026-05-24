import type { CommandResultPayload } from "@openbridge/shared";
import { ErrorCode } from "@openbridge/shared";
import type { BridgeWebSocketServer } from "../bridge/websocket-server.js";
import type { PermissionManager } from "../policy/permissions.js";
import type { RequestQueue } from "../session/request-queue.js";
import type { TabLeaseManager } from "../session/tab-lease.js";

const READ_ONLY_TOOLS = new Set([
  "browser_list_tabs",
  "browser_snapshot",
  "browser_screenshot",
  "browser_find_tab",
]);

export interface ToolExecutionResult {
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export class BridgeController {
  private paused = false;

  constructor(
    private wsServer: BridgeWebSocketServer,
    private permissionManager: PermissionManager,
    private tabLeaseManager?: TabLeaseManager,
    private requestQueue?: RequestQueue,
  ) {}

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getPrimarySessionId(): string | undefined {
    const sessions = this.wsServer.getConnectedSessionIds();
    return sessions[0];
  }

  getStatus(): {
    connectedSessions: string[];
    paused: boolean;
    enabledTools: string[];
  } {
    return {
      connectedSessions: this.wsServer.getConnectedSessionIds(),
      paused: this.paused,
      enabledTools: this.permissionManager.getEnabledTools(),
    };
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    sessionId?: string,
  ): Promise<ToolExecutionResult> {
    const permission = this.permissionManager.isToolAllowed(toolName);
    if (!permission.allowed) {
      return {
        error: {
          code: permission.error ?? "UNKNOWN",
          message: `Tool ${toolName} is not allowed`,
        },
      };
    }

    if (this.paused && !READ_ONLY_TOOLS.has(toolName)) {
      return {
        error: {
          code: ErrorCode.PERMISSION_DENIED,
          message: "AI control is paused",
        },
      };
    }

    const targetSessionId = sessionId ?? this.getPrimarySessionId();
    if (!targetSessionId) {
      return {
        error: {
          code: ErrorCode.NOT_PAIRED,
          message: "No browser extension connected",
        },
      };
    }

    if (toolName === "browser_select_tab") {
      const tabId = args.tabId;
      if (typeof tabId === "number" && this.tabLeaseManager) {
        const leaseResult = this.tabLeaseManager.acquire(tabId, targetSessionId);
        if (!leaseResult.success) {
          return {
            error: {
              code: leaseResult.error ?? ErrorCode.TAB_LEASED_BY_OTHER_SESSION,
              message: `Tab ${tabId} is leased by another session`,
            },
          };
        }
      }
    }

    if (this.tabLeaseManager && !READ_ONLY_TOOLS.has(toolName) && toolName !== "browser_list_tabs") {
      const activeTabId = this.tabLeaseManager.getLeasesBySession(targetSessionId)[0]?.tabId;
      if (activeTabId !== undefined) {
        this.tabLeaseManager.renew(activeTabId, targetSessionId);
      }
    }

    const executeCommand = async (): Promise<CommandResultPayload> => {
      return this.wsServer.sendCommand(targetSessionId, {
        name: toolName,
        args,
      });
    };

    try {
      const result =
        this.requestQueue && !READ_ONLY_TOOLS.has(toolName)
          ? await this.requestQueue.enqueue(executeCommand)
          : await executeCommand();

      if (result.error) {
        return { error: result.error };
      }

      return { data: result.data ?? null };
    } catch (err) {
      return {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
