import path from "node:path";

export const ROOT_DIR = path.resolve(import.meta.dirname, "../../../../");
export const DATA_DIR = path.join(ROOT_DIR, ".openbridge-data");
export const RUNTIME_FILE = path.join(DATA_DIR, "runtime.json");
export const LOG_FILE = path.join(DATA_DIR, "daemon.log");
export const PID_FILE = path.join(DATA_DIR, "daemon.pid");
export const DEFAULT_WS_PORT = 10087;
export const DEFAULT_API_PORT = 10088;
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_TMUX_SESSION = "openbridge-daemon";
