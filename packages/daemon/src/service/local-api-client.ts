export class LocalApiClient {
  constructor(
    private basePort = 10088,
    private host = "127.0.0.1",
  ) {}

  async health(): Promise<Record<string, unknown>> {
    return this.request("GET", "/health");
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    sessionId?: string,
  ): Promise<{ data?: unknown; error?: { code: string; message: string } }> {
    return this.request("POST", "/command", { toolName, args, sessionId });
  }

  async setPaused(paused: boolean): Promise<Record<string, unknown>> {
    return this.request("POST", "/config", { paused });
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let offset = 0; offset <= 10; offset++) {
      const port = this.basePort + offset;
      try {
        const response = await fetch(`http://${this.host}:${port}${path}`, {
          method,
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        const payload = (await response.json()) as any;
        if (!response.ok) {
          throw new Error(payload.error ?? payload?.error?.message ?? `Request failed (${response.status})`);
        }
        return payload;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error("OpenBridge local API unavailable");
  }
}
