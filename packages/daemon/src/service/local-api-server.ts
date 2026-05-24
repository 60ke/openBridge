import http from "node:http";
import { URL } from "node:url";
import { logger } from "../diagnostics/logger.js";
import type { BridgeController } from "./bridge-controller.js";

interface LocalApiServerOptions {
  port?: number;
  host?: string;
}

export class LocalApiServer {
  private port: number;
  private host: string;
  private server: http.Server | null = null;

  constructor(
    private controller: BridgeController,
    options: LocalApiServerOptions = {},
  ) {
    this.port = options.port ?? 10088;
    this.host = options.host ?? "127.0.0.1";
  }

  async start(): Promise<void> {
    const basePort = this.port;
    for (let offset = 0; offset <= 10; offset++) {
      const port = basePort + offset;
      try {
        await this.listen(port);
        this.port = port;
        return;
      } catch {
        continue;
      }
    }
    throw new Error(`Failed to start local API server: ports ${basePort}-${basePort + 10} are all in use`);
  }

  private async listen(port: number): Promise<void> {
    this.server = http.createServer(async (req, res) => {
      try {
        const remoteAddress = req.socket.remoteAddress;
        if (
          remoteAddress !== "127.0.0.1" &&
          remoteAddress !== "::1" &&
          remoteAddress !== "::ffff:127.0.0.1"
        ) {
          res.writeHead(403).end(JSON.stringify({ error: "Forbidden" }));
          return;
        }

        if (!req.url) {
          res.writeHead(400).end(JSON.stringify({ error: "Missing URL" }));
          return;
        }

        const url = new URL(req.url, `http://${this.host}:${port}`);
        if (req.method === "GET" && url.pathname === "/health") {
          this.writeJson(res, 200, { ok: true, port: this.port, ...this.controller.getStatus() });
          return;
        }

        if (req.method === "POST" && url.pathname === "/command") {
          const body = await this.readJsonBody(req);
          const toolName = typeof body.toolName === "string" ? body.toolName : "";
          const args =
            body.args && typeof body.args === "object" ? (body.args as Record<string, unknown>) : {};
          const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
          const result = await this.controller.executeTool(toolName, args, sessionId);
          this.writeJson(res, result.error ? 400 : 200, result);
          return;
        }

        if (req.method === "POST" && url.pathname === "/config") {
          const body = await this.readJsonBody(req);
          if (typeof body.paused === "boolean") {
            this.controller.setPaused(body.paused);
          }
          this.writeJson(res, 200, { ok: true, paused: this.controller.isPaused() });
          return;
        }

        this.writeJson(res, 404, { error: "Not found" });
      } catch (error) {
        logger.error("Local API error", error);
        this.writeJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.server?.off("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        this.server?.off("error", onError);
        resolve();
      };
      this.server?.once("error", onError);
      this.server?.once("listening", onListening);
      this.server?.listen(port, this.host);
    });
  }

  getPort(): number {
    return this.port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
    this.server = null;
  }

  private async readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  }

  private writeJson(res: http.ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  }
}
