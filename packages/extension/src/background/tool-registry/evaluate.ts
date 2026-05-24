import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class EvaluateHandler implements ToolHandler {
  name = "browser_evaluate";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const items = await chrome.storage.local.get(["evaluate_enabled"]);
    const result = !!items.evaluate_enabled;

    if (!result) {
      return {
        error: {
          code: "PERMISSION_DENIED",
          message:
            "browser_evaluate is not enabled. Enable it in the extension popup.",
        },
      };
    }

    const expression = args.expression as string;
    const evalResult = await cdpExecutor.sendCommand("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });

    if (evalResult.exceptionDetails) {
      return {
        error: {
          code: "INTERNAL_ERROR",
          message:
            evalResult.exceptionDetails.text ??
            evalResult.exceptionDetails.exception?.description ??
            "Evaluation threw an exception",
        },
      };
    }

    return {
      data: {
        result: evalResult.result.value,
        type: evalResult.result.type,
      },
    };
  }
}
