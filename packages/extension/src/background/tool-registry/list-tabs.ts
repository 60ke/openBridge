import type { ToolHandler } from "../command-router";
import { tabGroupManager } from "../session/tab-group-manager";

export class ListTabsHandler implements ToolHandler {
  name = "browser_list_tabs";

  async execute(
    _args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const tabs = await chrome.tabs.query({});

    const enrichedTabs = await Promise.all(
      tabs.map(async (tab) => {
        const entry: Record<string, unknown> = {
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active,
        };

        if (tab.groupId != null && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
          try {
            const group = await chrome.tabGroups.get(tab.groupId);
            entry.groupId = tab.groupId;
            entry.groupTitle = group.title;
            entry.groupColor = group.color;
          } catch {
            entry.groupId = tab.groupId;
          }
        }

        return entry;
      })
    );

    return {
      data: {
        tabs: enrichedTabs,
      },
    };
  }
}
