#!/usr/bin/env node

import { serveCommand } from "./serve.js";
import { doctorCommand } from "./doctor.js";
import { pairCommand } from "./pair.js";
import { resetPairingCommand } from "./reset-pairing.js";
import { statusCommand } from "./status.js";
import { mcpCommand } from "./mcp.js";

const args = process.argv.slice(2);
const command = args[0] || "serve";

async function main(): Promise<void> {
  switch (command) {
    case "serve": {
      let port: number | undefined;
      const portIndex = args.indexOf("--port");
      if (portIndex !== -1 && args[portIndex + 1]) {
        port = parseInt(args[portIndex + 1], 10);
      }
      let apiPort: number | undefined;
      const apiPortIndex = args.indexOf("--api-port");
      if (apiPortIndex !== -1 && args[apiPortIndex + 1]) {
        apiPort = parseInt(args[apiPortIndex + 1], 10);
      }
      await serveCommand({ port, apiPort });
      break;
    }
    case "mcp": {
      let apiPort: number | undefined;
      const apiPortIndex = args.indexOf("--api-port");
      if (apiPortIndex !== -1 && args[apiPortIndex + 1]) {
        apiPort = parseInt(args[apiPortIndex + 1], 10);
      }
      await mcpCommand({ apiPort });
      break;
    }
    case "doctor": {
      let port: number | undefined;
      const portIndex = args.indexOf("--port");
      if (portIndex !== -1 && args[portIndex + 1]) {
        port = parseInt(args[portIndex + 1], 10);
      }
      await doctorCommand({ port });
      break;
    }
    case "pair":
      await pairCommand();
      break;
    case "reset-pairing":
      await resetPairingCommand();
      break;
    case "status":
      await statusCommand();
      break;
    default:
      console.log(`Usage: openbridge <command>`);
      console.log(`Commands:`);
      console.log(`  serve           Start the OpenBridge daemon (default)`);
      console.log(`  mcp             Start stdio MCP shim and attach to daemon`);
      console.log(`  doctor          Run diagnostics checks`);
      console.log(`  pair            Initiate pairing with the extension`);
      console.log(`  reset-pairing   Reset pairing data`);
      console.log(`  status          Check daemon status`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
