import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class KeyTypeHandler implements ToolHandler {
  name = "browser_key_type";

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

    const text = args.text as string;

    await cdpExecutor.sendCommand("Input.insertText", { text });

    return {
      data: { text },
    };
  }
}
