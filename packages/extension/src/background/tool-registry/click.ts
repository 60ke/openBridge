import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

async function clickBySelector(selector: string): Promise<{ x: number; y: number }> {
  const doc = await cdpExecutor.sendCommand("DOM.getDocument");
  const root = doc.root.nodeId;
  const queryResult = await cdpExecutor.sendCommand("DOM.querySelector", {
    nodeId: root,
    selector,
  });
  const nodeId = queryResult.nodeId;
  if (!nodeId) {
    throw new Error(`Element not found for selector: ${selector}`);
  }
  const boxModel = await cdpExecutor.sendCommand("DOM.getBoxModel", { nodeId });
  const quad = boxModel.model.content;
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  await cdpExecutor.sendCommand("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await cdpExecutor.sendCommand("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  return { x, y };
}

async function clickByRef(ref: string): Promise<{ x: number; y: number }> {
  const describeResult = await cdpExecutor.sendCommand("DOM.describeNode", {
    backendNodeId: Number(ref),
  });
  const nodeId = describeResult.node.nodeId;
  const boxModel = await cdpExecutor.sendCommand("DOM.getBoxModel", { nodeId });
  const quad = boxModel.model.content;
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  await cdpExecutor.sendCommand("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await cdpExecutor.sendCommand("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  return { x, y };
}

export class ClickHandler implements ToolHandler {
  name = "browser_click";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const selector = args.selector as string | undefined;
    const ref = args.ref as string | undefined;

    let coords: { x: number; y: number } | undefined;

    if (selector) {
      coords = await clickBySelector(selector);
    } else if (ref) {
      coords = await clickByRef(ref);
    } else {
      return {
        error: {
          code: "INVALID_PARAMS",
          message: "Either selector or ref must be provided",
        },
      };
    }

    return {
      data: {
        success: true,
        selector: selector || ref,
        x: coords.x,
        y: coords.y,
      },
    };
  }
}
