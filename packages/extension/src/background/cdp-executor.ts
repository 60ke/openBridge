const MANAGED_TABS_KEY = "managedTabs";
const LABELS_KEY = "tabLabels";
const COUNTER_KEY = "labelCounter";

export class CdpExecutor {
  activeTabId: number | null = null;
  private attachedTabs = new Set<number>();
  private tabLabels = new Map<number, string>();
  private labelCounter = 0;

  async restoreState(): Promise<void> {
    const data = await chrome.storage.session.get([MANAGED_TABS_KEY, LABELS_KEY, COUNTER_KEY]);
    const managedTabIds: number[] = data[MANAGED_TABS_KEY] ?? [];
    const savedLabels: Record<string, string> = data[LABELS_KEY] ?? {};
    this.labelCounter = (data[COUNTER_KEY] as number) ?? 0;

    for (const tabId of managedTabIds) {
      const label = savedLabels[String(tabId)];
      if (!label) continue;

      try {
        await chrome.debugger.attach({ tabId }, "1.3");
      } catch {
        await this.persistRemove(tabId);
        continue;
      }

      this.attachedTabs.add(tabId);
      this.tabLabels.set(tabId, label);
    }
  }

  private async persistAdd(tabId: number, label: string): Promise<void> {
    const data = await chrome.storage.session.get([MANAGED_TABS_KEY, LABELS_KEY]);
    const ids: number[] = data[MANAGED_TABS_KEY] ?? [];
    const labels: Record<string, string> = data[LABELS_KEY] ?? {};
    if (!ids.includes(tabId)) ids.push(tabId);
    labels[String(tabId)] = label;
    await chrome.storage.session.set({
      [MANAGED_TABS_KEY]: ids,
      [LABELS_KEY]: labels,
      [COUNTER_KEY]: this.labelCounter,
    });
  }

  private async persistRemove(tabId: number): Promise<void> {
    const data = await chrome.storage.session.get([MANAGED_TABS_KEY, LABELS_KEY]);
    const ids: number[] = data[MANAGED_TABS_KEY] ?? [];
    const labels: Record<string, string> = data[LABELS_KEY] ?? {};
    delete labels[String(tabId)];
    await chrome.storage.session.set({
      [MANAGED_TABS_KEY]: ids.filter((id) => id !== tabId),
      [LABELS_KEY]: labels,
      [COUNTER_KEY]: this.labelCounter,
    });
  }

  private async persistClear(): Promise<void> {
    await chrome.storage.session.set({
      [MANAGED_TABS_KEY]: [],
      [LABELS_KEY]: {},
      [COUNTER_KEY]: this.labelCounter,
    });
  }

  async attach(tabId: number, setTitle = true): Promise<void> {
    if (this.isAttached(tabId)) {
      this.activeTabId = tabId;
      return;
    }
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already attached")) {
        this.attachedTabs.add(tabId);
        this.activeTabId = tabId;
        if (!this.tabLabels.has(tabId)) {
          this.labelCounter++;
          this.tabLabels.set(tabId, `🤖-${String(this.labelCounter).padStart(3, "0")}`);
          this.persistAdd(tabId, this.tabLabels.get(tabId)!);
        }
        if (setTitle) await this.setTabLabelTitle(tabId);
      return;
    }
    throw e;
  }
  this.activeTabId = tabId;
  this.attachedTabs.add(tabId);
  if (!this.tabLabels.has(tabId)) {
    this.labelCounter++;
    this.tabLabels.set(tabId, `🤖-${String(this.labelCounter).padStart(3, "0")}`);
    this.persistAdd(tabId, this.tabLabels.get(tabId)!);
  }
  if (setTitle) await this.setTabLabelTitle(tabId);
  }

  async detach(tabId?: number): Promise<void> {
    const targetId = tabId ?? this.activeTabId;
    if (targetId == null) return;
    await chrome.debugger.detach({ tabId: targetId });
    if (this.activeTabId === targetId) {
      this.activeTabId = null;
    }
    this.attachedTabs.delete(targetId);
  }

  async sendCommand(method: string, params?: object): Promise<any> {
    if (this.activeTabId == null) {
      throw new Error("No active tab attached to debugger");
    }
    return chrome.debugger.sendCommand(
      { tabId: this.activeTabId },
      method,
      params ?? {}
    );
  }

  isActive(tabId?: number): boolean {
    const targetId = tabId ?? this.activeTabId;
    if (targetId == null) return false;
    return this.activeTabId === targetId;
  }

  isAttached(tabId: number): boolean {
    return this.attachedTabs.has(tabId);
  }

  getAllAttachedTabIds(): number[] {
    return Array.from(this.attachedTabs);
  }

  getTabLabel(tabId: number): string | undefined {
    return this.tabLabels.get(tabId);
  }

  getAllTabLabels(): Map<number, string> {
    return new Map(this.tabLabels);
  }

  private titleInjectedTabs = new Set<number>();

  clearTitleInjected(tabId: number): void {
    this.titleInjectedTabs.delete(tabId);
  }

  async setTabLabelTitle(tabId: number): Promise<void> {
    const label = this.tabLabels.get(tabId);
    if (!label) return;
    try {
      if (!this.titleInjectedTabs.has(tabId)) {
        await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
          expression: [
            `(function() {`,
            `  const p = ${JSON.stringify(`${label}-`)};`,
            `  const re = /^\\u{1F916}-\\d{3}-/;`,
            `  const orig = Object.getOwnPropertyDescriptor(Document.prototype, 'title');`,
            `  Object.defineProperty(document, 'title', {`,
            `    get() { return orig.get.call(this); },`,
            `    set(v) { orig.set.call(this, re.test(v) ? v : p + v.replace(re, '')); },`,
            `    configurable: true`,
            `  });`,
            `  document.title = document.title;`,
            `})();`
          ].join('\n')
        });
        this.titleInjectedTabs.add(tabId);
      } else {
        await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
          expression: `document.title = document.title`
        });
      }
    } catch {
    }
  }

  async removeTab(tabId: number): Promise<void> {
    this.attachedTabs.delete(tabId);
    this.tabLabels.delete(tabId);
    this.titleInjectedTabs.delete(tabId);
    await this.persistRemove(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  async clearAll(): Promise<void> {
    this.attachedTabs.clear();
    this.tabLabels.clear();
    this.titleInjectedTabs.clear();
    await this.persistClear();
    this.activeTabId = null;
  }
}

export const cdpExecutor = new CdpExecutor();