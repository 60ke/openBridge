import { BridgeWsClient } from "./ws-client";

const ALARM_NAME = "openbridge-reconnect";
const STORAGE_KEY = "openbridge-connection-state";

interface PersistedState {
  url: string;
  shouldReconnect: boolean;
}

export class ReconnectManager {
  private client: BridgeWsClient;
  private alarmListener: ((alarm: ChromeAlarm) => void) | null = null;

  constructor(client: BridgeWsClient) {
    this.client = client;
  }

  async saveState(state: PersistedState): Promise<void> {
    await chrome.storage.session.set({ [STORAGE_KEY]: state });
  }

  async loadState(): Promise<PersistedState | null> {
    const result = await chrome.storage.session.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as PersistedState) ?? null;
  }

  createAlarm(): void {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  }

  onAlarm = (alarm: ChromeAlarm): void => {
    if (alarm.name !== ALARM_NAME) return;
    if (this.client.state === "disconnected" && this.client.shouldReconnect) {
      this.client.connect();
    }
  };

  start(): void {
    this.createAlarm();
    this.alarmListener = this.onAlarm;
    chrome.alarms.onAlarm.addListener(this.alarmListener);
  }

  stop(): void {
    chrome.alarms.clear(ALARM_NAME);
    if (this.alarmListener) {
      chrome.alarms.onAlarm.removeListener(this.alarmListener);
      this.alarmListener = null;
    }
  }

  async restoreOnWake(): Promise<void> {
    const state = await this.loadState();
    if (state?.url) {
      this.client.setPreferredUrl(state.url);
    }
    if (state && state.shouldReconnect && this.client.state === "disconnected") {
      this.client.connect();
    }
  }
}
