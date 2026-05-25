import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import {
  type BridgeMessage,
  type CommandPayload,
  type CommandResultPayload,
  type EventPayload,
  type HelloPayload,
  type PairChallengePayload,
  ErrorCode,
} from "@openbridge-org/shared";
import { encodeMessage, decodeMessage, createHelloAck, createError } from "./protocol.js";
import type { PairingManager } from "./pairing.js";
import type { AuthManager } from "./auth.js";

interface BridgeWebSocketServerOptions {
  port?: number;
  host?: string;
}

interface PendingCommand {
  resolve: (result: CommandResultPayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class BridgeWebSocketServer extends EventEmitter {
  private port: number;
  private host: string;
  private wss: WebSocketServer | null = null;
  private extensions: Map<string, WebSocket> = new Map();
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private sessionMap: Map<WebSocket, string> = new Map();
  private tokenMap: Map<WebSocket, string | undefined> = new Map();
  private pairingManager: PairingManager;
  private authManager: AuthManager;

  constructor(
    pairingManager: PairingManager,
    authManager: AuthManager,
    options: BridgeWebSocketServerOptions = {},
  ) {
    super();
    this.pairingManager = pairingManager;
    this.authManager = authManager;
    this.port = options.port ?? 10086;
    this.host = options.host ?? "127.0.0.1";
  }

  async start(): Promise<void> {
    const basePort = this.port;
    for (let offset = 0; offset <= 10; offset++) {
      const port = basePort + offset;
      try {
        const wss = await new Promise<WebSocketServer>((resolve, reject) => {
          const server = new WebSocketServer({
            port,
            host: this.host,
            path: "/bridge",
          });

          const onError = (err: Error) => {
            server.close();
            reject(err);
          };

          server.on("error", onError);
          server.on("listening", () => {
            server.off("error", onError);
            resolve(server);
          });
        });

        this.wss = wss;
        this.port = port;
        this.setupServer();
        return;
      } catch {
        continue;
      }
    }
    throw new Error(`Failed to start server: ports ${basePort}-${basePort + 10} are all in use`);
  }

  getPort(): number {
    return this.port;
  }

  private setupServer(): void {
    if (!this.wss) return;

    this.wss.on("connection", (ws, req) => {
      const remoteAddress = req.socket.remoteAddress;
      if (
        remoteAddress !== "127.0.0.1" &&
        remoteAddress !== "::1" &&
        remoteAddress !== "::ffff:127.0.0.1"
      ) {
        ws.close(4403, "Forbidden: non-loopback connection");
        return;
      }

      const origin = req.headers.origin;
      if (!this.authManager.validateOrigin(origin)) {
        ws.close(4403, "Forbidden: invalid origin");
        return;
      }

      ws.on("message", (raw) => {
        this.handleMessage(ws, raw.toString());
      });

      ws.on("close", () => {
        const sessionId = this.sessionMap.get(ws);
        if (sessionId) {
          this.extensions.delete(sessionId);
          this.sessionMap.delete(ws);
          this.emit("extension-disconnected", sessionId);
        }
        this.tokenMap.delete(ws);
      });
    });
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(raw);
    } catch {
      this.emit("log", "warn", `Invalid JSON received: ${raw.substring(0, 100)}`);
      return;
    }

    let msg: BridgeMessage;
    try {
      msg = decodeMessage(raw);
    } catch (err) {
      this.emit("log", "warn", `Invalid message format: ${(err as Error).message}`);
      return;
    }

    this.emit("log", "info", `Received message type: ${msg.type}`);

    switch (msg.type) {
      case "hello": {
        const payload = msg.payload as HelloPayload & { token?: string };
        const sessionId = payload.sessionId;
        this.emit("log", "info", `Hello from sessionId: ${sessionId}`);
        this.extensions.set(sessionId, ws);
        this.sessionMap.set(ws, sessionId);
        this.tokenMap.set(ws, payload.token);

        const token = payload.token;
        const auth = this.authManager.isAuthorized(token);
        this.emit("log", "info", `Auth result: authorized=${auth.authorized}`);

        if (!auth.authorized) {
          try {
            const secret = this.pairingManager.initiatePairing();
            this.emit("log", "info", `Pairing initiated, sending pair_challenge`);
            const challenge: BridgeMessage = {
              type: "pair_challenge",
              payload: { challenge: secret } as PairChallengePayload,
              timestamp: Date.now(),
            } as BridgeMessage;
            ws.send(encodeMessage(challenge));
          } catch (err) {
            this.emit("log", "error", `Failed to initiate pairing: ${(err as Error).message}`);
            const error = createError("", ErrorCode.INTERNAL_ERROR, `Pairing failed: ${(err as Error).message}`);
            ws.send(encodeMessage(error));
          }
          break;
        }

        this.emit("log", "info", `Sending hello_ack for sessionId: ${sessionId}`);
        const ack = createHelloAck();
        ack.payload.sessionId = sessionId;
        ws.send(encodeMessage(ack));

        this.emit("extension-connected", sessionId);
        break;
      }

      case "pair_confirmed": {
        const payload = msg.payload as unknown as { secret: string; token: string };
        const confirmed = this.pairingManager.confirmPairing(payload.secret, payload.token);
        if (confirmed) {
          this.tokenMap.set(ws, payload.token);
          const sessionId = this.sessionMap.get(ws);
          const ack = createHelloAck();
          if (sessionId) {
            ack.payload.sessionId = sessionId;
          }
          ws.send(encodeMessage(ack));
          if (sessionId) {
            this.emit("extension-connected", sessionId);
          }
        } else {
          const error = createError(
            "",
            ErrorCode.AUTH_FAILED,
            "Pairing confirmation failed: secret mismatch",
          );
          ws.send(encodeMessage(error));
        }
        break;
      }

      case "heartbeat": {
        break;
      }

      case "command_result": {
        const requestId = envelope.requestId as string | undefined;
        if (requestId && this.pendingCommands.has(requestId)) {
          const pending = this.pendingCommands.get(requestId)!;
          clearTimeout(pending.timer);
          this.pendingCommands.delete(requestId);
          pending.resolve(msg.payload as CommandResultPayload);
        }
        break;
      }

      case "event": {
        const token = this.tokenMap.get(ws);
        const auth = this.authManager.isAuthorized(token);
        if (!auth.authorized) {
          const error = createError("", auth.error!, "Not authorized");
          ws.send(encodeMessage(error));
          break;
        }

        const payload = msg.payload as EventPayload;
        if (
          payload.eventType === "tab_closed" ||
          payload.eventType === "debugger_detached" ||
          payload.eventType === "config_changed"
        ) {
          this.emit("event", payload);
        }
        break;
      }
    }
  }

  sendCommand(sessionId: string, command: CommandPayload): Promise<CommandResultPayload> {
    const ws = this.extensions.get(sessionId);
    if (!ws) {
      return Promise.reject(new Error(`No extension with sessionId: ${sessionId}`));
    }

    const requestId = randomUUID();

    return new Promise<CommandResultPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new Error(`Command timed out after 30s (requestId: ${requestId})`));
      }, 30_000);

      this.pendingCommands.set(requestId, { resolve, reject, timer });

      const msg: BridgeMessage = {
        type: "command",
        payload: command,
        timestamp: Date.now(),
      } as BridgeMessage;

      ws.send(encodeMessage(msg, { requestId, sessionId }));
    });
  }

  broadcast(message: BridgeMessage): void {
    const data = encodeMessage(message);
    for (const ws of this.extensions.values()) {
      ws.send(data);
    }
  }

  getConnectedSessionIds(): string[] {
    return Array.from(this.extensions.keys());
  }

  async stop(): Promise<void> {
    for (const [, pending] of this.pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server shutting down"));
    }
    this.pendingCommands.clear();

    for (const ws of this.extensions.values()) {
      ws.close();
    }
    this.extensions.clear();
    this.sessionMap.clear();
    this.tokenMap.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }
  }
}
