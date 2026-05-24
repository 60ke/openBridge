import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class TypeHandler implements ToolHandler {
  name = "browser_type";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const text = args.text as string;
    for (const char of text) {
      await cdpExecutor.sendCommand("Input.dispatchKeyEvent", {
        type: "char",
        text: char,
      });
    }
    return {
      data: {
        success: true,
      },
    };
  }
}
