import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode } from "@openbridge-org/shared";
import { getToolDefinitions } from "./tools.js";
import type { BridgeController } from "../service/bridge-controller.js";
import type { LocalApiClient } from "../service/local-api-client.js";

interface ToolExecutor {
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    sessionId?: string,
  ): Promise<{ data?: unknown; error?: { code: string; message: string } }>;
  setPaused?(paused: boolean): Promise<unknown> | void;
}

export class OpenBridgeMcpServer {
  private mcpServer: McpServer;
  private paused = false;

  constructor(private executor: ToolExecutor) {
    this.mcpServer = new McpServer({ name: "openbridge", version: "0.1.0" });
    this.registerTools();
  }

  static fromBridgeController(controller: BridgeController): OpenBridgeMcpServer {
    return new OpenBridgeMcpServer(controller);
  }

  static fromLocalApi(client: LocalApiClient): OpenBridgeMcpServer {
    return new OpenBridgeMcpServer(client);
  }

  async setPaused(paused: boolean): Promise<void> {
    this.paused = paused;
    await this.executor.setPaused?.(paused);
  }

  isPaused(): boolean {
    return this.paused;
  }

  private registerTools(): void {
    const definitions = getToolDefinitions();

    for (const def of definitions) {
      this.mcpServer.tool(def.name, def.description, def.shape, async (args) => {
        if (this.paused && def.name !== "browser_list_tabs" && def.name !== "browser_snapshot" && def.name !== "browser_screenshot") {
          return {
            content: [{ type: "text" as const, text: `Error: ${ErrorCode.PERMISSION_DENIED} - AI control is paused` }],
            isError: true,
          };
        }

        const result = await this.executor.executeTool(def.name, args as Record<string, unknown>);

        if (result.error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error.code} - ${result.error.message}` }],
            isError: true,
          };
        }

        if (def.name === "browser_screenshot" && result.data && typeof result.data === "object") {
          const data = result.data as Record<string, unknown>;
          if (typeof data.base64 === "string") {
            return {
              content: [{ type: "image" as const, data: data.base64, mimeType: "image/png" }],
            };
          }
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result.data ?? null, null, 2) }],
        };
      });
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }
}
