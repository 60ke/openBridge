const COLOR_POOL: chrome.tabGroups.ColorEnum[] = [
  "blue", "red", "yellow", "green", "cyan", "orange", "pink", "purple", "grey",
];

interface SessionGroupInfo {
  groupId: number;
  color: chrome.tabGroups.ColorEnum;
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

  private nextColor(): chrome.tabGroups.ColorEnum {
    const color = COLOR_POOL[this.colorIndex % COLOR_POOL.length];
    this.colorIndex++;
    return color;
  }

  async ensureGroup(sessionId: string, groupTitle?: string, groupColor?: string): Promise<number> {
    const existing = this.sessionGroups.get(sessionId);
    if (existing) {
      try {
        await chrome.tabGroups.get(existing.groupId);
        return existing.groupId;
      } catch {
        this.sessionGroups.delete(sessionId);
      }
    }

    const color = (groupColor as chrome.tabGroups.ColorEnum) ?? this.nextColor();
    const title = groupTitle ?? `agent:${sessionId}`;

    const groupId = await chrome.tabs.group({
      tabIds: [],
      createProperties: { windowId: chrome.windows.WINDOW_ID_CURRENT },
    });

    try {
      await chrome.tabGroups.update(groupId, { title, color });
    } catch {
      // group with no tabs may be auto-removed, that's ok
    }

    this.sessionGroups.set(sessionId, { groupId, color, title });
    return groupId;
  }

  async addTabToSession(sessionId: string, tabId: number, groupTitle?: string, groupColor?: string): Promise<void> {
    const groupId = await this.ensureGroup(sessionId, groupTitle, groupColor);
    try {
      await chrome.tabs.group({ groupId, tabIds: [tabId] });
    } catch {
      this.sessionGroups.delete(sessionId);
    }

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
