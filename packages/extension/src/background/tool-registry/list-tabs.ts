import type { ToolHandler } from "../command-router";

export class ListTabsHandler implements ToolHandler {
  name = "browser_list_tabs";

  async execute(
    _args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const tabs = await chrome.tabs.query({});
    return {
      data: {
        tabs: tabs.map((tab) => ({
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active,
        })),
      },
    };
  }
}
