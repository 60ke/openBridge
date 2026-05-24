import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class SelectTabHandler implements ToolHandler {
  name = "browser_select_tab";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const tabId = args.tabId as number;
    await chrome.tabs.update(tabId, { active: true });
    await cdpExecutor.attach(tabId);
    const tab = await chrome.tabs.get(tabId);
    return {
      data: {
        tabId,
        url: tab.url,
        title: tab.title,
      },
    };
  }
}
