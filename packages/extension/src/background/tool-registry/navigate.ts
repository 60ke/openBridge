import type { ToolHandler } from "../command-router";
import { cdpExecutor } from "../cdp-executor";
import { tabGroupManager } from "../session/tab-group-manager";

export class NavigateHandler implements ToolHandler {
  name = "browser_navigate";

  async execute(
    args: Record<string, any>
  ): Promise<{ data?: any; error?: { code: string; message: string } }> {
    const url = args.url as string;
    const newTab = args.newTab === true;
    const sessionId = typeof args.sessionId === "string" ? args.sessionId : undefined;
    const groupTitle = typeof args.groupTitle === "string" ? args.groupTitle : undefined;
    const groupColor = typeof args.groupColor === "string" ? args.groupColor : undefined;
    const waitUntil = (args.waitUntil as string) ?? "load";
    const timeoutMs = (args.timeoutMs as number) ?? 15000;

    let tabId: number;

    if (newTab) {
      const tab = await chrome.tabs.create({ url, active: true });
      if (tab.id == null) {
        return {
          error: {
            code: "TAB_NOT_FOUND",
            message: "Chrome did not return a tab id for the new tab",
          },
        };
      }
      tabId = tab.id;
      await cdpExecutor.attach(tabId);

      if (sessionId) {
        try {
          await tabGroupManager.addTabToSession(sessionId, tabId, groupTitle, groupColor);
        } catch {}
      }
    } else {
      if (cdpExecutor.activeTabId == null) {
        return {
          error: {
            code: "TAB_NOT_FOUND",
            message: "No active tab attached to debugger",
          },
        };
      }
      tabId = cdpExecutor.activeTabId;
      await cdpExecutor.sendCommand("Page.navigate", { url });
    }

    if (waitUntil !== "none") {
      const loaded = await this.waitForLoad(tabId, waitUntil, timeoutMs);
      if (!loaded) {
        return {
          data: {
            url,
            tabId,
            loaded: false,
            timeout: true,
          },
        };
      }
    }

    const groupInfo = sessionId ? tabGroupManager.getGroupInfo(sessionId) : undefined;

    return {
      data: {
        url,
        tabId,
        loaded: true,
        ...(groupInfo ? { groupId: groupInfo.groupId, groupTitle: groupInfo.title, groupColor: groupInfo.color } : {}),
      },
    };
  }

  private waitForLoad(tabId: number, waitUntil: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(false);
      }, timeoutMs);

      const listener = (updatedTabId: number, changeInfo: ChromeTabChangeInfo) => {
        if (updatedTabId !== tabId) return;

        if (waitUntil === "domcontentloaded" && changeInfo.status === "loading") {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true);
        } else if (waitUntil === "load" && changeInfo.status === "complete") {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true);
        } else if (waitUntil === "networkIdle") {
          if (changeInfo.status === "complete") {
            setTimeout(() => {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              resolve(true);
            }, 500);
          }
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }
}
