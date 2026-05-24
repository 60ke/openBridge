import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class NewTabHandler implements ToolHandler {
  name = "browser_new_tab";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const url = typeof args.url === "string" ? args.url : "about:blank";
    const tab = await chrome.tabs.create({ url, active: true });
    if (tab.id == null) {
      return {
        error: {
          code: "TAB_NOT_FOUND",
          message: "Chrome did not return a tab id for the new tab",
        },
      };
    }

    await cdpExecutor.attach(tab.id);

    return {
      data: {
        tabId: tab.id,
        url: tab.url ?? url,
        title: tab.title ?? "",
      },
    };
  }
}
