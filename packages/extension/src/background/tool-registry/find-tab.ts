import type { ToolHandler } from "../command-router";
import { tabGroupManager } from "../session/tab-group-manager";

export class FindTabHandler implements ToolHandler {
  name = "browser_find_tab";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const query = typeof args.query === "string" ? args.query.toLowerCase() : undefined;
    const urlContains = typeof args.urlContains === "string" ? args.urlContains.toLowerCase() : undefined;
    const titleContains = typeof args.titleContains === "string" ? args.titleContains.toLowerCase() : undefined;
    const sessionId = typeof args.sessionId === "string" ? args.sessionId : undefined;
    const activate = args.activate === true;

    let tabs = await chrome.tabs.query({});

    if (urlContains) {
      tabs = tabs.filter((t) => (t.url ?? "").toLowerCase().includes(urlContains));
    }
    if (titleContains) {
      tabs = tabs.filter((t) => (t.title ?? "").toLowerCase().includes(titleContains));
    }
    if (query) {
      tabs = tabs.filter(
        (t) =>
          (t.url ?? "").toLowerCase().includes(query) ||
          (t.title ?? "").toLowerCase().includes(query)
      );
    }
    if (sessionId) {
      const managedIds = new Set(await tabGroupManager.getManagedTabIds(sessionId));
      tabs = tabs.filter((t) => managedIds.has(t.id!));
    }

    const results = tabs.map((t) => ({
      tabId: t.id,
      url: t.url,
      title: t.title,
      active: t.active,
    }));

    if (activate && results.length > 0) {
      const targetTab = results[0];
      await chrome.tabs.update(targetTab.tabId!, { active: true });
      targetTab.active = true;
    }

    return {
      data: { tabs: results, count: results.length },
    };
  }
}
