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
}

interface ChromeDebuggee {
  tabId?: number;
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
    sendMessage(tabId: number, message: Record<string, unknown>): Promise<unknown>;
    onRemoved: {
      addListener(callback: (tabId: number) => void): void;
    };
  };
  debugger: {
    attach(target: ChromeDebuggee, requiredVersion: string): Promise<void>;
    detach(target: ChromeDebuggee): Promise<void>;
    sendCommand(target: ChromeDebuggee, method: string, commandParams?: object): Promise<any>;
    onDetach: {
      addListener(callback: (source: ChromeDebuggee, reason: string) => void): void;
    };
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
