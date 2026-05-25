# OpenBridge

[中文说明](./README.zh-CN.md)

OpenBridge is a local browser bridge for AI agents. It lets MCP-capable clients and Codex-style skills control the user's real Chrome browser through a local daemon and a Chrome extension.

## What It Does

OpenBridge provides a Kimi WebBridge-like architecture:

```text
AI client / MCP client / Codex skill
        |
        | stdio MCP or local HTTP API
        v
OpenBridge daemon
        |
        | ws://127.0.0.1:10087/bridge
        v
OpenBridge Chrome extension
        |
        v
User's real Chrome tabs
```

The daemon is long-running, while `openbridge mcp` is a lightweight stdio shim that attaches to the daemon. This allows one browser connection to be reused by multiple local AI sessions.

## Features

- Real Chrome tab control through a browser extension
- Automatic extension authorization after first connection
- Local-only daemon and API
- MCP stdio support
- Codex-style skill support through the local HTTP API
- Tab creation, navigation, selection, listing, and closing
- Session-based tab groups with color labels
- Accessibility snapshots with stable refs
- Click, coordinate click, fill, type, key input, and shortcuts
- Screenshot, PDF export, file upload
- Network event observation
- Pause control and optional JavaScript execution permission

## Install

```bash
./install.sh
```

The installer will:

- install dependencies and build the daemon, shared package, and extension
- start the OpenBridge daemon in the background
- install the `openbridge-webbridge` skill for Codex-style clients
- print the Chrome extension loading path
- keep MCP available as an optional standard interface

Then load the unpacked Chrome extension from:

```text
packages/extension/.output/chrome-mv3
```

Open `chrome://extensions`, enable Developer Mode, choose **Load unpacked**, and select the directory above.

After the daemon and extension are both running, the extension authorizes automatically. The popup should show `Authorized`. Codex can then use the installed skill to call `http://127.0.0.1:10088/command` directly, without requiring OpenBridge to appear in an MCP server list.

Installer options:

```bash
./install.sh --no-skill
./install.sh --no-start
```

## Useful Commands

```bash
node packages/daemon/dist/cli/index.js serve
node packages/daemon/dist/cli/index.js mcp
node packages/daemon/dist/cli/index.js status
node packages/daemon/dist/cli/index.js doctor
node packages/daemon/dist/cli/index.js reset-pairing
```

## Local API

The daemon exposes a local HTTP API on `127.0.0.1:10088`.

Health check:

```bash
curl -s http://127.0.0.1:10088/health
```

Run a browser command:

```bash
curl -s -X POST http://127.0.0.1:10088/command \
  -H 'Content-Type: application/json' \
  -d '{"toolName":"browser_list_tabs","args":{}}'
```

## MCP Config

The default smooth path is `skill + daemon local API`. MCP is still supported as a standard integration surface.

Example config is in [openbridge-mcp-config.example.json](./openbridge-mcp-config.example.json).

```json
{
  "mcpServers": {
    "openbridge": {
      "command": "node",
      "args": [
        "/absolute/path/to/openBridge/packages/daemon/dist/cli/index.js",
        "mcp"
      ]
    }
  }
}
```

## Browser Tools

OpenBridge currently supports:

```text
browser_list_tabs
browser_new_tab
browser_select_tab
browser_navigate
browser_snapshot
browser_click
browser_mouse_click
browser_fill
browser_type
browser_key_type
browser_send_keys
browser_screenshot
browser_evaluate
browser_close_tab
browser_close_session
browser_find_tab
browser_upload
browser_save_as_pdf
browser_network
```

## Security Model

- The daemon binds to loopback only.
- The extension connects only to the local daemon.
- Browser control can be paused from the extension popup.
- `browser_evaluate` is disabled by default and must be explicitly enabled.
- Pairing tokens are local machine state and should not be committed.
- `.openbridge-data/` is ignored by Git.

## Development

```bash
pnpm install
pnpm typecheck
pnpm build
```

Reload the unpacked extension after rebuilding:

```text
packages/extension/.output/chrome-mv3
```
