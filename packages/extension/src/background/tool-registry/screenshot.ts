import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class ScreenshotHandler implements ToolHandler {
  name = "browser_screenshot";

  async execute(
    _args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const result = await cdpExecutor.sendCommand("Page.captureScreenshot", {
      format: "png",
    });
    return {
      data: {
        base64: result.data,
        mimeType: "image/png",
      },
    };
  }
}
