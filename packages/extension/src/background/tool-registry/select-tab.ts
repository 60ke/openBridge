import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";
import { tabGroupManager } from "../session/tab-group-manager";

export class SelectTabHandler implements ToolHandler {
  name = "browser_select_tab";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const tabId = args.tabId as number;
    const sessionId = typeof args.sessionId === "string" ? args.sessionId : undefined;
    const groupTitle = typeof args.groupTitle === "string" ? args.groupTitle : undefined;
    const groupColor = typeof args.groupColor === "string" ? args.groupColor : undefined;

    await chrome.tabs.update(tabId, { active: true });
    await cdpExecutor.attach(tabId);

    if (sessionId) {
      try {
        await tabGroupManager.addTabToSession(sessionId, tabId, groupTitle, groupColor);
      } catch {}
    }

    const tab = await chrome.tabs.get(tabId);
    const groupInfo = sessionId ? tabGroupManager.getGroupInfo(sessionId) : undefined;

    return {
      data: {
        tabId,
        url: tab.url,
        title: tab.title,
        ...(groupInfo ? { groupId: groupInfo.groupId, groupTitle: groupInfo.title, groupColor: groupInfo.color } : {}),
      },
    };
  }
}
