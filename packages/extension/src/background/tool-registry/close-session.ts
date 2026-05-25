import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";
import { tabGroupManager } from "../session/tab-group-manager";

export class CloseSessionHandler implements ToolHandler {
  name = "browser_close_session";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const sessionId = args.sessionId as string;
    const closeTabs = args.closeTabs !== false;

    const managedTabIds = await tabGroupManager.getManagedTabIds(sessionId);

    if (closeTabs && managedTabIds.length > 0) {
      for (const tabId of managedTabIds) {
        if (cdpExecutor.isActive(tabId)) {
          try {
            await cdpExecutor.detach(tabId);
          } catch {}
        }
      }

      try {
        await chrome.tabs.remove(managedTabIds);
      } catch {}
    }

    await tabGroupManager.clearSession(sessionId);

    return {
      data: {
        sessionId,
        closedTabCount: managedTabIds.length,
        closedTabs: closeTabs,
      },
    };
  }
}
