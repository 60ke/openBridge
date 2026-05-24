import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class MouseClickHandler implements ToolHandler {
  name = "browser_mouse_click";

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

    const x = args.x as number;
    const y = args.y as number;
    const button = (args.button as string) ?? "left";
    const clickCount = (args.clickCount as number) ?? 1;

    const buttonEnum = button === "right" ? "mouseRight" : button === "middle" ? "mouseMiddle" : "mouseLeft";

    await cdpExecutor.sendCommand("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: buttonEnum,
      clickCount,
    });

    await cdpExecutor.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: buttonEnum,
      clickCount,
    });

    return {
      data: { x, y, button, clickCount },
    };
  }
}
