import type {
  BridgeMessage,
  HelloPayload,
  HeartbeatPayload,
  HelloAckPayload,
  PairChallengePayload,
  CommandPayload,
  ErrorPayload,
} from "@openbridge-org/shared";

type WsState = "disconnected" | "connecting" | "connected";

type EventCallback = (...args: unknown[]) => void;

interface BridgeWsClientOptions {
  url?: string;
}

export class BridgeWsClient {
  url: string;
  currentUrl: string;
  socket: WebSocket | null = null;
  state: WsState = "disconnected";
  isAuthorized = false;
  shouldReconnect = true;
  reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<string, EventCallback[]>();
  private urlCandidates: string[];
  private candidateIndex = 0;
  storedToken: string | null = null;
  private tokenReady: Promise<void>;

  constructor(options: BridgeWsClientOptions = {}) {
    this.url = options.url ?? "ws://127.0.0.1:10087/bridge";
    this.currentUrl = this.url;
    this.urlCandidates = this.buildUrlCandidates(this.url);
    this.tokenReady = this.loadToken();
  }

  private buildUrlCandidates(primaryUrl: string): string[] {
    const match = primaryUrl.match(/^ws:\/\/127\.0\.0\.1:(\d+)\/bridge$/);
    if (!match) {
      return [primaryUrl];
    }

    const basePort = Number(match[1]);
    const candidates: string[] = [];
    for (let offset = 0; offset <= 10; offset++) {
      candidates.push(`ws://127.0.0.1:${basePort + offset}/bridge`);
    }
    return candidates;
  }

  setPreferredUrl(url: string): void {
    this.url = url;
    this.urlCandidates = this.buildUrlCandidates(url);
    this.candidateIndex = 0;
    this.currentUrl = this.urlCandidates[0] ?? url;
  }

  private async loadToken(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(["openbridge_token"]);
      if (result.openbridge_token) {
        this.storedToken = result.openbridge_token as string;
      }
    } catch {}
  }

  private saveToken(token: string): void {
    this.storedToken = token;
    try {
      void chrome.storage.local.set({ openbridge_token: token });
    } catch {}
  }

  clearToken(): void {
    this.storedToken = null;
    try {
      void chrome.storage.local.remove("openbridge_token");
    } catch {}
  }

  on(event: string, callback: EventCallback): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(callback);
    this.listeners.set(event, existing);
  }

  off(event: string, callback: EventCallback): void {
    const existing = this.listeners.get(event);
    if (!existing) return;
    const updated = existing.filter((cb) => cb !== callback);
    if (updated.length === 0) {
      this.listeners.delete(event);
    } else {
      this.listeners.set(event, updated);
    }
  }

  private emit(event: string, ...args: unknown[]): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    for (const cb of callbacks) {
      cb(...args);
    }
  }

  connect(): void {
    this.state = "connecting";
    this.shouldReconnect = true;
    this.currentUrl = this.urlCandidates[this.candidateIndex] ?? this.url;

    const ws = new WebSocket(this.currentUrl);
    this.socket = ws;

    ws.onopen = () => {
      this.state = "connected";
      this.isAuthorized = false;
      this.candidateIndex = 0;
      void this.sendHello();
      this.startHeartbeat();
      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        this.handleMessage(event.data);
      }
    };

    ws.onclose = () => {
      const wasConnecting = this.state === "connecting";
      this.state = "disconnected";
      this.isAuthorized = false;
      this.stopHeartbeat();
      if (this.shouldReconnect) {
        if (wasConnecting) {
          this.candidateIndex = (this.candidateIndex + 1) % this.urlCandidates.length;
        }
        this.scheduleReconnect();
      }
    };

    ws.onerror = (err) => {
      const isInitialConnect = this.state === "connecting";
      const detail =
        err instanceof Event && err.type
          ? err.type
          : err instanceof Error
            ? err.message
            : String(err);

      if (isInitialConnect) {
        console.warn(`[OpenBridge] WebSocket connect failed for ${this.currentUrl}: ${detail}`);
      } else {
        console.error(`[OpenBridge] WebSocket error on ${this.currentUrl}: ${detail}`);
      }
    };
  }

  private async sendHello(): Promise<void> {
    await this.tokenReady;
    if (this.state !== "connected" || !this.socket) return;

    const manifest = chrome.runtime.getManifest();
    const helloPayload: HelloPayload & { token?: string } = {
      version: manifest.version,
      sessionId: crypto.randomUUID(),
    };
    if (this.storedToken) {
      helloPayload.token = this.storedToken;
    }
    this.send({
      type: "hello",
      payload: helloPayload,
      timestamp: Date.now(),
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.state = "disconnected";
  }

  confirmPairing(secret: string): void {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    this.saveToken(token);
    this.send({
      type: "pair_confirmed",
      payload: { secret, token },
      timestamp: Date.now(),
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const payload: HeartbeatPayload = { timestamp: Date.now() };
      this.send({
        type: "heartbeat",
        payload,
        timestamp: Date.now(),
      });
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(message: BridgeMessage): void {
    if (this.state !== "connected" || !this.socket) {
      throw new Error("[OpenBridge] Cannot send: not connected");
    }
    this.socket.send(JSON.stringify(message));
  }

  handleMessage(raw: string): void {
    let parsed: BridgeMessage;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[OpenBridge] Failed to parse message:", raw);
      return;
    }

    switch (parsed.type) {
      case "hello_ack": {
        this.isAuthorized = true;
        const payload = parsed.payload as HelloAckPayload;
        this.emit("connected", payload);
        break;
      }
      case "heartbeat": {
        const payload = parsed.payload as HeartbeatPayload;
        this.emit("heartbeat", payload);
        break;
      }
      case "command": {
        const payload = parsed.payload as CommandPayload;
        this.emit("command", { payload, requestId: (parsed as any).requestId, sessionId: (parsed as any).sessionId });
        break;
      }
      case "pair_challenge": {
        this.isAuthorized = false;
        const payload = parsed.payload as PairChallengePayload;
        this.emit("pair-challenge", payload);
        break;
      }
      case "error": {
        const payload = parsed.payload as ErrorPayload;
        this.emit("error", payload);
        break;
      }
    }
  }
}
