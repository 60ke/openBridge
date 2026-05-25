import { LocalApiClient } from "../service/local-api-client.js";
import { OpenBridgeMcpServer } from "../mcp/server.js";
import { getDefaultApiPort } from "../runtime/runtime-state.js";

export async function mcpCommand(options?: { apiPort?: number }): Promise<void> {
  const client = new LocalApiClient(options?.apiPort ?? getDefaultApiPort());
  await client.health();
  const mcpServer = OpenBridgeMcpServer.fromLocalApi(client);
  await mcpServer.start();
}
