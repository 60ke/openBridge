import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class NavigateHandler implements ToolHandler {
  name = "browser_navigate";

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
    const url = args.url as string;
    const result = await cdpExecutor.sendCommand("Page.navigate", { url });
    return {
      data: {
        url,
        frameId: result.frameId,
      },
    };
  }
}
