# OpenBridge

OpenBridge is a local browser bridge for MCP-capable AI clients.

## Architecture

- `openbridge serve`: starts the long-running local bridge daemon
- `openbridge mcp`: starts a stdio MCP shim that attaches to the running daemon
- Chrome extension: connects to the bridge daemon over local WebSocket

This split lets one local browser connection be reused by multiple future MCP sessions, which is closer to the Kimi-style experience than binding browser control to a single stdio process.

## Local setup

```bash
./install.sh
```

Then load the unpacked extension from:

```text
packages/extension/.output/chrome-mv3
```

Open the extension popup and complete pairing.

## MCP config

Example config is in [openbridge-mcp-config.example.json](/Users/k/Desktop/openBridge/openbridge-mcp-config.example.json).

Core command:

```json
{
  "mcpServers": {
    "openbridge": {
      "command": "node",
      "args": [
        "/Users/k/Desktop/openBridge/packages/daemon/dist/cli/index.js",
        "mcp"
      ]
    }
  }
}
```

## Useful commands

```bash
node packages/daemon/dist/cli/index.js serve
node packages/daemon/dist/cli/index.js mcp
node packages/daemon/dist/cli/index.js status
node packages/daemon/dist/cli/index.js doctor
```
