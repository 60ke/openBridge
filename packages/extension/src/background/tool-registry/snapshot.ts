import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class SnapshotHandler implements ToolHandler {
  name = "browser_snapshot";

  async execute(
    _args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const result = await cdpExecutor.sendCommand("Accessibility.getFullAXTree");
    const nodes = (result.nodes as Array<Record<string, any>>).map((node) => ({
      role: node.role?.value,
      name: node.name?.value,
      ref: node.backendDOMNodeId,
    }));
    return {
      data: {
        snapshot: nodes,
      },
    };
  }
}
