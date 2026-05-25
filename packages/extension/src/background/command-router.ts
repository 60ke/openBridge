import type { CommandPayload, CommandResultPayload } from "@openbridge-org/shared";
import type { BridgeWsClient } from "./ws-client";

export interface ToolHandler {
  name: string;
  execute(args: Record<string, any>): Promise<{
    data?: any;
    error?: { code: string; message: string };
  }>;
}

export class CommandRouter {
  tools: Map<string, ToolHandler> = new Map();
  private client: BridgeWsClient;
  onResult?: (command: CommandPayload, result: CommandResultPayload) => void;

  constructor(client: BridgeWsClient) {
    this.client = client;
  }

  registerTool(handler: ToolHandler): void {
    this.tools.set(handler.name, handler);
  }

  async route(command: CommandPayload): Promise<CommandResultPayload> {
    const handler = this.tools.get(command.name);
    if (!handler) {
      return {
        error: {
          code: "UNKNOWN_TOOL",
          message: `Unknown tool: ${command.name}`,
        },
      };
    }
    try {
      return await handler.execute(command.args as Record<string, any>);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      };
    }
  }

  setup(): void {
    this.client.on("command", async (data: unknown) => {
      const { payload, requestId, sessionId } = data as {
        payload: CommandPayload;
        requestId?: string;
        sessionId?: string;
      };
      const command = payload as CommandPayload;
      const result = await this.route(command);
      this.onResult?.(command, result);
      const response: Record<string, unknown> = {
        type: "command_result",
        payload: result,
        timestamp: Date.now(),
      };
      if (requestId) response.requestId = requestId;
      if (sessionId) response.sessionId = sessionId;
      this.client.send(response as any);
    });
  }
}
