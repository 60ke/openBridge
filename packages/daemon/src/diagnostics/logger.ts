type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = new Set(["cookie", "authorization", "password", "token", "secret"]);

export class Logger {
  private format(level: LogLevel, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[OpenBridge] ${timestamp} [${level.toUpperCase()}]`;
    const formatted = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(this.sanitize(a))))
      .join(" ");
    return `${prefix} ${formatted}`;
  }

  debug(...args: unknown[]): void {
    console.debug(this.format("debug", ...args));
  }

  info(...args: unknown[]): void {
    console.info(this.format("info", ...args));
  }

  warn(...args: unknown[]): void {
    console.warn(this.format("warn", ...args));
  }

  error(...args: unknown[]): void {
    console.error(this.format("error", ...args));
  }

  sanitize(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data === "string") {
      if (data.startsWith("data:image/")) return "[REDACTED_IMAGE]";
      return data.length > 200 ? data.slice(0, 200) + "...[truncated]" : data;
    }
    if (Array.isArray(data)) return data.map((item) => this.sanitize(item));
    if (typeof data === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(key)) {
          result[key] = "[REDACTED]";
        } else {
          result[key] = this.sanitize(value);
        }
      }
      return result;
    }
    return data;
  }
}

export const logger = new Logger();
