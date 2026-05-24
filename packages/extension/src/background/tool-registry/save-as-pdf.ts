import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class SaveAsPdfHandler implements ToolHandler {
  name = "browser_save_as_pdf";

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

    const printBackground = args.printBackground !== false;

    const result = await cdpExecutor.sendCommand("Page.printToPDF", {
      printBackground,
    });

    return {
      data: {
        base64: result.data,
        mimeType: "application/pdf",
      },
    };
  }
}
