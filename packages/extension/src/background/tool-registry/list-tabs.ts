import type { ToolHandler } from "../command-router";
import { tabGroupManager } from "../session/tab-group-manager";
import { cdpExecutor } from "../cdp-executor";

export class ListTabsHandler implements ToolHandler {
  name = "browser_list_tabs";

  async execute(
    _args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const tabs = await chrome.tabs.query({});
    const allLabels = cdpExecutor.getAllTabLabels();

    const enrichedTabs = await Promise.all(
      tabs.map(async (tab) => {
        const entry: Record<string, unknown> = {
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active,
        };

        const label = tab.id != null ? allLabels.get(tab.id) : undefined;
        if (label) {
          entry.label = label;
        }

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
