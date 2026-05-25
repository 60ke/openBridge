import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import WebSocket from "ws";
import { PairingManager } from "../bridge/pairing.js";
import { LocalApiClient } from "../service/local-api-client.js";

interface DoctorResult {
  label: string;
  ok: boolean;
  detail?: string;
  fix?: string;
}

const ROOT_DIR = path.resolve(import.meta.dirname, "../../../../");
const EXTENSION_BUILD_DIR = path.join(ROOT_DIR, "packages/extension/.output/chrome-mv3");
const DAEMON_DIST_DIR = path.join(ROOT_DIR, "packages/daemon/dist");
const SHARED_DIST_DIR = path.join(ROOT_DIR, "packages/shared/dist");
const VERSION = "0.1.0";

export async function doctorCommand(options?: {
  port?: number;
  apiPort?: number;
}): Promise<void> {
  const port = options?.port ?? 10087;
  const apiPort = options?.apiPort ?? 10088;
  const results: DoctorResult[] = [];

  results.push(checkNodeVersion());
  results.push(checkPnpm());
  results.push(checkProjectBuilt());
  results.push(checkExtensionBuild());
  results.push(checkExtensionVersion());
  results.push(await checkWsPortAvailable(port));
  results.push(await checkApiPortAvailable(apiPort));
  results.push(checkPairingStatus());
  results.push(checkDataDir());
  results.push(await checkDaemonRunning(port));

  const daemonRunning = results.find(
    (r) => r.label === "OpenBridge daemon reachable",
  )?.ok;

  if (daemonRunning) {
    const localApiHealthy = await checkLocalApi(apiPort);
    results.push(localApiHealthy);

    const extensionConnected = await checkExtensionConnected(apiPort);
    results.push(extensionConnected);

    if (localApiHealthy.ok) {
      results.push(await checkToolCount(apiPort));
    }
  }

  results.push(checkMcpConfig());

  console.log("\nOpenBridge Doctor\n");
  let hasError = false;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const detail = r.detail ? ` (${r.detail})` : "";
    console.log(`  ${icon} ${r.label}${detail}`);
    if (!r.ok) {
      hasError = true;
      if (r.fix) {
        console.log(`     💡 ${r.fix}`);
      }
    }
  }
  console.log();

  if (hasError) {
    console.log("Some checks failed. Follow the 💡 hints to fix them.\n");
  } else {
    console.log("All checks passed! OpenBridge is ready.\n");
  }
}

function checkNodeVersion(): DoctorResult {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  return {
    label: "Node.js version",
    ok: major >= 18,
    detail: nodeVersion,
    fix: major < 18 ? "Install Node.js 18+ from https://nodejs.org" : undefined,
  };
}

function checkPnpm(): DoctorResult {
  try {
    const pnpmVersion = execSync("pnpm --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return {
      label: "pnpm",
      ok: true,
      detail: pnpmVersion,
    };
  } catch {
    return {
      label: "pnpm",
      ok: false,
      detail: "Not found",
      fix: "Install pnpm: npm install -g pnpm",
    };
  }
}

function checkProjectBuilt(): DoctorResult {
  const daemonOk = fs.existsSync(path.join(DAEMON_DIST_DIR, "cli/index.js"));
  const sharedOk = fs.existsSync(path.join(SHARED_DIST_DIR, "index.js"));

  if (daemonOk && sharedOk) {
    return { label: "Project build", ok: true, detail: "daemon + shared built" };
  }

  const missing: string[] = [];
  if (!daemonOk) missing.push("daemon");
  if (!sharedOk) missing.push("shared");

  return {
    label: "Project build",
    ok: false,
    detail: `Missing: ${missing.join(", ")}`,
    fix: "Run: pnpm build",
  };
}

function checkExtensionBuild(): DoctorResult {
  const manifestPath = path.join(EXTENSION_BUILD_DIR, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    return { label: "Extension build", ok: true, detail: "chrome-mv3 output exists" };
  }
  return {
    label: "Extension build",
    ok: false,
    detail: "No extension build found",
    fix: "Run: pnpm build (or cd packages/extension && pnpm build)",
  };
}

function checkExtensionVersion(): DoctorResult {
  const manifestPath = path.join(EXTENSION_BUILD_DIR, "manifest.json");
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);
    const extVersion = manifest.version ?? "unknown";
    const match = extVersion === VERSION;
    return {
      label: "Extension version",
      ok: match,
      detail: match
        ? `v${extVersion} (matches daemon)`
        : `v${extVersion} (daemon: v${VERSION})`,
      fix: match
        ? undefined
        : "Rebuild extension: cd packages/extension && pnpm build",
    };
  } catch {
    return {
      label: "Extension version",
      ok: false,
      detail: "Cannot read manifest.json",
    };
  }
}

async function checkWsPortAvailable(port: number): Promise<DoctorResult> {
  const available = await checkPortAvailable(port);
  return {
    label: `WebSocket port ${port}`,
    ok: true,
    detail: available ? "Available" : "In use (daemon may be running)",
  };
}

async function checkApiPortAvailable(port: number): Promise<DoctorResult> {
  const available = await checkPortAvailable(port);
  return {
    label: `API port ${port}`,
    ok: true,
    detail: available ? "Available" : "In use (daemon may be running)",
  };
}

function checkPairingStatus(): DoctorResult {
  const pairingManager = new PairingManager();
  const isPaired = pairingManager.isPaired();
  return {
    label: "Pairing status",
    ok: isPaired,
    detail: isPaired ? "Paired" : "Not paired",
    fix: isPaired ? undefined : "Load or reload the Chrome extension; it should authorize automatically",
  };
}

function checkDataDir(): DoctorResult {
  const dataDir = path.join(process.cwd(), ".openbridge-data");
  const exists = fs.existsSync(dataDir);
  if (exists) {
    const files = fs.readdirSync(dataDir);
    return {
      label: "Data directory",
      ok: true,
      detail: `${dataDir} (${files.length} file${files.length !== 1 ? "s" : ""})`,
    };
  }
  return {
    label: "Data directory",
    ok: true,
    detail: "Not created yet (will be created on first run)",
  };
}

async function checkDaemonRunning(port: number): Promise<DoctorResult> {
  const running = await checkDaemonWs(port);
  return {
    label: "OpenBridge daemon reachable",
    ok: running,
    detail: running ? `Running on port ${port}` : "Not running",
    fix: running ? undefined : "Run: openbridge serve (or ./install.sh)",
  };
}

async function checkLocalApi(apiPort: number): Promise<DoctorResult> {
  try {
    const client = new LocalApiClient(apiPort);
    const result = await client.health();
    const returnedPort = result.port;
    return {
      label: "Local API reachable",
      ok: true,
      detail: `Running on port ${typeof returnedPort === "number" ? returnedPort : apiPort}`,
    };
  } catch {
    return {
      label: "Local API reachable",
      ok: false,
      detail: "Not reachable",
      fix: "Ensure daemon is running: openbridge serve",
    };
  }
}

async function checkExtensionConnected(apiPort: number): Promise<DoctorResult> {
  try {
    const client = new LocalApiClient(apiPort);
    const result = await client.health();
    const sessions = result.connectedSessions as string[] | undefined;
    const connected = Array.isArray(sessions) && sessions.length > 0;
    return {
      label: "Extension connected",
      ok: connected,
    detail: connected ? `Connected (${sessions!.length} session${sessions!.length !== 1 ? "s" : ""})` : "Not connected",
    fix: connected
      ? undefined
      : "Open Chrome and load or reload the OpenBridge extension; authorization is automatic",
    };
  } catch {
    return {
      label: "Extension connected",
      ok: false,
      detail: "Cannot query",
      fix: "Ensure daemon is running: openbridge serve",
    };
  }
}

async function checkToolCount(apiPort: number): Promise<DoctorResult> {
  try {
    const client = new LocalApiClient(apiPort);
    const result = await client.health();
    const enabledTools = result.enabledTools as string[] | undefined;
    if (Array.isArray(enabledTools)) {
      const count = enabledTools.length;
      return {
        label: "Registered tools",
        ok: count >= 18,
        detail: `${count} enabled${count < 18 ? " (expected 18+)" : ""} (browser_evaluate requires manual enable)`,
        fix:
          count < 18
            ? "Some tools are missing. Rebuild and restart daemon."
            : undefined,
      };
    }
    return {
      label: "Registered tools",
      ok: true,
      detail: "Available (count not reported)",
    };
  } catch {
    return {
      label: "Registered tools",
      ok: false,
      detail: "Cannot query",
    };
  }
}

function checkMcpConfig(): DoctorResult {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (!homeDir) {
    return {
      label: "MCP client config",
      ok: false,
      detail: "Cannot determine home directory",
    };
  }

  const configPaths = [
    path.join(
      homeDir,
      "Library/Application Support/Claude/claude_desktop_config.json",
    ),
    path.join(homeDir, ".config/claude/config.json"),
    path.join(homeDir, ".cursor/mcp.json"),
  ];

  for (const configPath of configPaths) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      const servers = config.mcpServers ?? config.servers;
      if (servers && servers.openbridge) {
        return {
          label: "MCP client config",
          ok: true,
          detail: `Found in ${path.basename(path.dirname(configPath))}`,
        };
      }
    } catch {
      // continue checking next path
    }
  }

  return {
    label: "Optional MCP client config",
    ok: true,
    detail: "Not configured (skill + local API is the default path)",
    fix: "Add openbridge to your MCP client config only if you want MCP integration",
  };
}

function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function checkDaemonWs(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 2000);
    ws.on("open", () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });
    ws.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}
