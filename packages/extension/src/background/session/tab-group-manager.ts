type TabGroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "cyan" | "orange" | "pink" | "purple";

const COLOR_POOL: TabGroupColor[] = [
  "blue", "red", "yellow", "green", "cyan", "orange", "pink", "purple", "grey",
];

interface SessionGroupInfo {
  groupId: number;
  color: TabGroupColor;
  title: string;
}

export class TabGroupManager {
  private sessionGroups = new Map<string, SessionGroupInfo>();
  private sessionTabs = new Map<string, Set<number>>();
  private colorIndex = 0;

  constructor() {
    if (typeof chrome !== "undefined" && chrome.tabGroups) {
      chrome.tabGroups.onRemoved.addListener((group) => {
        for (const [sessionId, info] of this.sessionGroups.entries()) {
          if (info.groupId === group.id) {
            this.sessionGroups.delete(sessionId);
            break;
          }
        }
      });
    }
  }

  private nextColor(): TabGroupColor {
    const color = COLOR_POOL[this.colorIndex % COLOR_POOL.length];
    this.colorIndex++;
    return color;
  }

  async addTabToSession(sessionId: string, tabId: number, groupTitle?: string, groupColor?: string): Promise<void> {
    const color = (groupColor as TabGroupColor) ?? this.nextColor();
    const title = groupTitle ?? `agent:${sessionId.slice(0, 8)}`;

    const existing = this.sessionGroups.get(sessionId);
    if (existing) {
      try {
        await chrome.tabGroups.get(existing.groupId);
        await chrome.tabs.group({ groupId: existing.groupId, tabIds: [tabId] });
        if (!this.sessionTabs.has(sessionId)) {
          this.sessionTabs.set(sessionId, new Set());
        }
        this.sessionTabs.get(sessionId)!.add(tabId);
        return;
      } catch {
        this.sessionGroups.delete(sessionId);
      }
    }

    const groupId = await chrome.tabs.group({
      tabIds: [tabId],
      createProperties: { windowId: chrome.windows.WINDOW_ID_CURRENT },
    });

    try {
      await chrome.tabGroups.update(groupId, { title, color });
    } catch {}

    this.sessionGroups.set(sessionId, { groupId, color, title });

    if (!this.sessionTabs.has(sessionId)) {
      this.sessionTabs.set(sessionId, new Set());
    }
    this.sessionTabs.get(sessionId)!.add(tabId);
  }

  getManagedTabIds(sessionId: string): number[] {
    return Array.from(this.sessionTabs.get(sessionId) ?? []);
  }

  getGroupInfo(sessionId: string): SessionGroupInfo | undefined {
    return this.sessionGroups.get(sessionId);
  }

  getGroupInfoByGroupId(groupId: number): { sessionId: string; info: SessionGroupInfo } | undefined {
    for (const [sessionId, info] of this.sessionGroups.entries()) {
      if (info.groupId === groupId) {
        return { sessionId, info };
      }
    }
    return undefined;
  }

  removeTabFromSession(sessionId: string, tabId: number): void {
    this.sessionTabs.get(sessionId)?.delete(tabId);
  }

  clearSession(sessionId: string): void {
    this.sessionGroups.delete(sessionId);
    this.sessionTabs.delete(sessionId);
  }

  getAllSessionIds(): string[] {
    return Array.from(this.sessionGroups.keys());
  }
}

export const tabGroupManager = new TabGroupManager();
