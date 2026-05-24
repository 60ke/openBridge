import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class FillHandler implements ToolHandler {
  name = "browser_fill";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const selector = args.selector as string;
    const value = args.value as string;

    const doc = await cdpExecutor.sendCommand("DOM.getDocument");
    const root = doc.root.nodeId;
    const queryResult = await cdpExecutor.sendCommand("DOM.querySelector", {
      nodeId: root,
      selector,
    });
    const nodeId = queryResult.nodeId;
    if (!nodeId) {
      return {
        error: {
          code: "ELEMENT_NOT_FOUND",
          message: `Element not found for selector: ${selector}`,
        },
      };
    }

    await cdpExecutor.sendCommand("DOM.focus", { nodeId });

    await cdpExecutor.sendCommand("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      modifiers: 2,
    });
    await cdpExecutor.sendCommand("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      modifiers: 2,
    });
    await cdpExecutor.sendCommand("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Backspace",
      code: "Backspace",
    });
    await cdpExecutor.sendCommand("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Backspace",
      code: "Backspace",
    });

    for (const char of value) {
      await cdpExecutor.sendCommand("Input.dispatchKeyEvent", {
        type: "char",
        text: char,
      });
    }

    return {
      data: {
        success: true,
        selector,
        value,
      },
    };
  }
}
