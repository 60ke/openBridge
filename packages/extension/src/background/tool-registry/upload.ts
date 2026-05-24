import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class UploadHandler implements ToolHandler {
  name = "browser_upload";

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

    const selector = args.selector as string;
    const paths = args.paths as string[];

    if (!selector || !paths || paths.length === 0) {
      return {
        error: {
          code: "INVALID_PARAMS",
          message: "selector and paths are required",
        },
      };
    }

    const doc = await cdpExecutor.sendCommand("DOM.getDocument");
    const nodeResult = await cdpExecutor.sendCommand("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    });

    if (!nodeResult.nodeId) {
      return {
        error: {
          code: "ELEMENT_NOT_FOUND",
          message: `Element not found: ${selector}`,
        },
      };
    }

    await cdpExecutor.sendCommand("DOM.setFileInputFiles", {
      nodeId: nodeResult.nodeId,
      files: paths,
    });

    return {
      data: { selector, files: paths },
    };
  }
}
