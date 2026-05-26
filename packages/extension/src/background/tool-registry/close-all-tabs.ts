import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";

export class CloseAllTabsHandler implements ToolHandler {
  name = "browser_close_all_managed_tabs";

  async execute(
    _args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const tabIds = cdpExecutor.getAllAttachedTabIds();

    for (const tabId of tabIds) {
      if (cdpExecutor.isAttached(tabId)) {
        try {
          await cdpExecutor.detach(tabId);
        } catch {}
      }
    }

    try {
      await chrome.tabs.remove(tabIds);
    } catch {}

    await cdpExecutor.clearAll();

    return {
      data: {
        closedTabCount: tabIds.length,
      },
    };
  }
}