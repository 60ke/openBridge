type TabGroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "cyan" | "orange" | "pink" | "purple";

const COLOR_POOL: TabGroupColor[] = [
  "blue", "red", "yellow", "green", "cyan", "orange", "pink", "purple", "grey",
];

interface SessionGroupInfo {
  groupId: number;
  color: TabGroupColor;
  title: string;
}

interface SessionData {
  sessionGroups: Array<[string, { groupId: number; color: TabGroupColor; title: string }]>;
  sessionTabs: Array<[string, number[]]>;
}

const STORAGE_KEY = "openbridge_tab_group_manager";

export class TabGroupManager {
  private sessionGroups = new Map<string, SessionGroupInfo>();
  private sessionTabs = new Map<string, Set<number>>();
  private colorIndex = 0;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof chrome !== "undefined" && chrome.tabGroups) {
      chrome.tabGroups.onRemoved.addListener((group) => {
        for (const [sessionId, info] of this.sessionGroups.entries()) {
          if (info.groupId === group.id) {
            this.sessionGroups.delete(sessionId);
            this.sessionTabs.delete(sessionId);
            this.scheduleSave();
            break;
          }
        }
      });
    }

    this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.session.get(STORAGE_KEY);
      const data = result[STORAGE_KEY] as SessionData | undefined;
      if (!data) return;

      if (data.sessionGroups) {
        for (const [sessionId, info] of data.sessionGroups) {
          try {
            await chrome.tabGroups.get(info.groupId);
            this.sessionGroups.set(sessionId, info);
          } catch {
            // group no longer exists, skip
          }
        }
      }

      if (data.sessionTabs) {
        for (const [sessionId, tabIds] of data.sessionTabs) {
          if (this.sessionGroups.has(sessionId)) {
            const validIds = new Set<number>();
            for (const tabId of tabIds) {
              try {
                await chrome.tabs.get(tabId);
                validIds.add(tabId);
              } catch {
                // tab no longer exists, skip
              }
            }
            this.sessionTabs.set(sessionId, validIds);
          }
        }
      }
    } catch {}
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveToStorage(), 500);
  }

  private async saveToStorage(): Promise<void> {
    this.saveTimer = null;
    try {
      const data: SessionData = {
        sessionGroups: Array.from(this.sessionGroups.entries()),
        sessionTabs: Array.from(this.sessionTabs.entries()).map(
          ([k, v]) => [k, Array.from(v)]
        ),
      };
      await chrome.storage.session.set({ [STORAGE_KEY]: data });
    } catch {}
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
        this.scheduleSave();
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
    this.scheduleSave();
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
    this.scheduleSave();
  }

  clearSession(sessionId: string): void {
    this.sessionGroups.delete(sessionId);
    this.sessionTabs.delete(sessionId);
    this.scheduleSave();
  }

  getAllSessionIds(): string[] {
    return Array.from(this.sessionGroups.keys());
  }
}

export const tabGroupManager = new TabGroupManager();
