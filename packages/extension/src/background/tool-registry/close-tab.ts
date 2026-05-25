import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";
import { tabGroupManager } from "../session/tab-group-manager";

export class CloseTabHandler implements ToolHandler {
  name = "browser_close_tab";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const tabId = args.tabId as number;

    try {
      await chrome.tabs.get(tabId);
    } catch {
      return {
        error: {
          code: "TAB_NOT_FOUND",
          message: `Tab not found: ${tabId}`,
        },
      };
    }

    if (cdpExecutor.isActive(tabId)) {
      try {
        await cdpExecutor.detach(tabId);
      } catch {}
    }

    await chrome.tabs.remove(tabId);

    for (const sessionId of await tabGroupManager.getAllSessionIds()) {
      await tabGroupManager.removeTabFromSession(sessionId, tabId);
    }

    return {
      data: { tabId, closed: true },
    };
  }
}
