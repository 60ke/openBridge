export class CdpExecutor {
  activeTabId: number | null = null;

  async attach(tabId: number): Promise<void> {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Already attached")) {
        throw e;
      }
    }
    this.activeTabId = tabId;
  }

  async detach(tabId?: number): Promise<void> {
    const targetId = tabId ?? this.activeTabId;
    if (targetId == null) return;
    await chrome.debugger.detach({ tabId: targetId });
    if (this.activeTabId === targetId) {
      this.activeTabId = null;
    }
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
}

export const cdpExecutor = new CdpExecutor();
