interface ChromeManifest {
  version: string;
}

interface ChromeMessageSender {}

interface ChromeStorageArea {
  get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, any>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface ChromeStorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
  groupId?: number;
  windowId?: number;
  status?: string;
}

interface ChromeTabChangeInfo {
  status?: string;
  url?: string;
  title?: string;
}

interface ChromeDebuggee {
  tabId?: number;
}

interface ChromeTabGroup {
  id: number;
  title?: string;
  color: string;
  collapsed: boolean;
  windowId: number;
}

interface ChromeAlarm {
  name: string;
}

interface ChromeApi {
  runtime: {
    getManifest(): ChromeManifest;
    sendMessage(message: Record<string, unknown>): Promise<Record<string, unknown> | undefined>;
    onMessage: {
      addListener(
        callback: (
          message: Record<string, unknown>,
          sender: ChromeMessageSender,
          sendResponse: (response?: Record<string, unknown>) => void,
        ) => boolean | void,
      ): void;
    };
  };
  storage: {
    local: ChromeStorageArea;
    session: ChromeStorageArea;
    onChanged: {
      addListener(
        callback: (
          changes: Record<string, ChromeStorageChange>,
          areaName: "local" | "sync" | "session" | "managed",
        ) => void,
      ): void;
    };
  };
  tabs: {
    create(createProperties: Record<string, unknown>): Promise<ChromeTab>;
    query(queryInfo: Record<string, unknown>): Promise<ChromeTab[]>;
    update(tabId: number, updateProperties: Record<string, unknown>): Promise<ChromeTab>;
    get(tabId: number): Promise<ChromeTab>;
    remove(tabIds: number | number[]): Promise<void>;
    sendMessage(tabId: number, message: Record<string, unknown>): Promise<unknown>;
    group(options: { tabIds: number[] | number; groupId?: number; createProperties?: { windowId?: number } }): Promise<number>;
    onRemoved: {
      addListener(callback: (tabId: number) => void): void;
    };
    onUpdated: {
      addListener(callback: (tabId: number, changeInfo: ChromeTabChangeInfo, tab: ChromeTab) => void): void;
      removeListener(callback: (tabId: number, changeInfo: ChromeTabChangeInfo, tab: ChromeTab) => void): void;
    };
  };
  tabGroups: {
    get(groupId: number): Promise<ChromeTabGroup>;
    update(groupId: number, updateProperties: { title?: string; color?: string; collapsed?: boolean }): Promise<ChromeTabGroup>;
    TAB_GROUP_ID_NONE: number;
    onRemoved: {
      addListener(callback: (group: { id: number; windowId: number }) => void): void;
    };
  };
  debugger: {
    attach(target: ChromeDebuggee, requiredVersion: string): Promise<void>;
    detach(target: ChromeDebuggee): Promise<void>;
    sendCommand(target: ChromeDebuggee, method: string, commandParams?: object): Promise<any>;
    onDetach: {
      addListener(callback: (source: ChromeDebuggee, reason: string) => void): void;
    };
    onEvent: {
      addListener(callback: (source: ChromeDebuggee, method: string, params?: any) => void): void;
      removeListener(callback: (source: ChromeDebuggee, method: string, params?: any) => void): void;
    };
  };
  windows: {
    WINDOW_ID_CURRENT: number;
    create(createData?: Record<string, unknown>): Promise<any>;
    get(windowId: number, getInfo?: Record<string, unknown>): Promise<any>;
  };
  alarms: {
    create(name: string, alarmInfo: Record<string, unknown>): void;
    clear(name: string): void;
    onAlarm: {
      addListener(callback: (alarm: ChromeAlarm) => void): void;
      removeListener(callback: (alarm: ChromeAlarm) => void): void;
    };
  };
}

declare const chrome: ChromeApi;
