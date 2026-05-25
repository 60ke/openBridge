# OpenBridge Project Context

OpenBridge is a local browser bridge designed to connect AI agents (like Gemini, Claude, or MCP-compatible clients) to a real Chrome browser instance. It follows an architecture similar to Kimi WebBridge, using a local daemon and a Chrome extension.

## Project Overview

- **Core Goal:** Enable AI agents to control a real browser with low latency and high reliability through a local-only bridge.
- **Architecture:**
    - **Daemon (`packages/daemon`):** A Node.js server that acts as the central hub. It exposes a local HTTP API and an MCP (Model Context Protocol) interface for AI clients, and a WebSocket server for the browser extension.
    - **Extension (`packages/extension`):** A Chrome MV3 extension (built with WXT) that connects to the daemon. it uses the `debugger` API (Chrome DevTools Protocol - CDP) to perform actions on tabs.
    - **Shared (`packages/shared`):** Contains common protocol definitions, error codes, and tool schemas used by both the daemon and the extension.
- **Key Technologies:** TypeScript, Node.js, pnpm (Monorepo), WXT (Extension Framework), MCP SDK, Chrome DevTools Protocol (CDP).

## Project Structure

- `packages/daemon/`: Entry point, CLI, HTTP/WS servers, and MCP server.
- `packages/extension/`: Extension entry points, CDP executors, and tool implementations.
- `packages/shared/`: Shared library for protocol and types.
- `test-pages/`: Local HTML files used for testing various browser interactions.

## Building and Running

### Prerequisites
- Node.js and `pnpm` installed.

### Standard Commands
- **Install Dependencies:** `pnpm install`
- **Build All:** `pnpm build`
- **Run Type Checks:** `pnpm typecheck`
- **Run Linting:** `pnpm lint`
- **Run Tests:** `pnpm test`

### Running the Project
1. **Start the Daemon:**
   ```bash
   node packages/daemon/dist/cli/index.js serve
   ```
   (Alternatively, use `pnpm build` then run from `dist`).
2. **Load the Extension:**
   - Go to `chrome://extensions`.
   - Enable "Developer mode".
   - Click "Load unpacked".
   - Select `packages/extension/.output/chrome-mv3`.
3. **Connect/Pair:**
   - Click the OpenBridge extension icon and ensure it shows "Connected" or "Authorized".

### Interface Ports
- **Daemon WebSocket (Extension):** `10087`
- **Daemon HTTP API (AI Clients):** `10088`

## Development Conventions

- **Language:** TypeScript for all packages.
- **Monorepo Management:** `pnpm` workspaces.
- **Extension Development:** Uses `wxt`. Entry points are in `packages/extension/entrypoints/`.
- **Command Routing:** Commands from AI clients are routed through the Daemon (`BridgeController`) to the Extension (`WSClient` -> `CommandRouter`).
- **Tool Definitions:** All browser tools (e.g., `browser_click`, `browser_navigate`) are defined in `packages/shared/src/protocol.ts`.
- **Security:**
    - The daemon binds to `127.0.0.1` only.
    - Authorization is handled via local pairing tokens.
    - Dangerous actions (e.g., `browser_evaluate`) may be restricted or require explicit permission.
- **Error Handling:** Use the shared `ErrorCode` from `@openbridge/shared`.

## Design Acknowledgments

OpenBridge's three-layer architecture (daemon + extension + local API) follows the proven model pioneered by Kimi WebBridge (Moonshot AI). Session management patterns are inspired by CodeX (OpenAI). OpenBridge builds on these concepts as an independent open-source project.

## Key Files for Reference
- `packages/daemon/src/index.ts`: Daemon exports.
- `packages/daemon/src/cli/index.ts`: Command-line interface.
- `packages/extension/wxt.config.ts`: Extension configuration.
- `packages/shared/src/protocol.ts`: Source of truth for all bridge tools.
- `install.sh`: Setup script for the entire environment.
