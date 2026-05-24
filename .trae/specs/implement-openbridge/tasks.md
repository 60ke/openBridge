# Tasks

- [x] Task 1: Create monorepo project skeleton
  - [x] SubTask 1.1: Initialize pnpm monorepo with `packages/daemon`, `packages/extension`, `packages/shared`
  - [x] SubTask 1.2: Configure TypeScript, ESLint, Prettier for all packages
  - [x] SubTask 1.3: Configure `packages/shared` with protocol types, error codes, permission levels
  - [x] SubTask 1.4: Verify `pnpm install && pnpm build` succeeds and shared types are importable

- [x] Task 2: Implement Daemon WebSocket Server
  - [x] SubTask 2.1: Create `packages/daemon/src/bridge/websocket-server.ts` — listen on `127.0.0.1:10086`, auto-detect port
  - [x] SubTask 2.2: Implement protocol message encode/decode using shared types
  - [x] SubTask 2.3: Implement `hello` / `hello_ack` handshake
  - [x] SubTask 2.4: Implement `heartbeat` bidirectional keepalive (30s interval)
  - [x] SubTask 2.5: Implement `command` / `command_result` message routing with requestId correlation
  - [x] SubTask 2.6: Implement `event` message handling (tab_closed, debugger_detached)
  - [ ] SubTask 2.7: Add unit tests for protocol encode/decode and message routing

- [x] Task 3: Implement Extension WebSocket Client with Reconnect
  - [x] SubTask 3.1: Create `packages/extension/src/background/ws-client.ts` — connect to `ws://127.0.0.1:10086/bridge`
  - [x] SubTask 3.2: Implement auto-reconnect with exponential backoff (5s initial)
  - [x] SubTask 3.3: Implement `chrome.alarms` periodic check (30s) to recover from Service Worker suspension
  - [x] SubTask 3.4: Persist connection state in `chrome.storage.session` for recovery
  - [x] SubTask 3.5: Implement hello handshake on connect and heartbeat keepalive
  - [ ] SubTask 3.6: Add unit tests for reconnect state machine

- [x] Task 4: Implement Pairing Authentication
  - [x] SubTask 4.1: Create `packages/daemon/src/bridge/pairing.ts` — generate pairing secret, validate tokens
  - [x] SubTask 4.2: Create `packages/daemon/src/bridge/auth.ts` — token persistence, Origin validation
  - [x] SubTask 4.3: Implement `pair_request` / `pair_challenge` / `pair_confirmed` message flow
  - [x] SubTask 4.4: Implement token persistence in Daemon (file-based, `~/.openbridge/pairing.json`)
  - [x] SubTask 4.5: Implement token persistence in Extension (`chrome.storage.local`)
  - [x] SubTask 4.6: Reject unpaired connections with `NOT_PAIRED` error
  - [ ] SubTask 4.7: Implement `openbridge reset-pairing` CLI command
  - [ ] SubTask 4.8: Add security tests: unpaired rejection, invalid token rejection, Origin validation

- [x] Task 5: Implement MCP Server in Daemon
  - [x] SubTask 5.1: Create `packages/daemon/src/mcp/server.ts` — stdio MCP Server using `@modelcontextprotocol/sdk`
  - [x] SubTask 5.2: Create `packages/daemon/src/mcp/tools.ts` — register all MVP tools with zod schemas
  - [x] SubTask 5.3: Implement tool call routing: MCP tool call → WebSocket `command` → wait `command_result` → return to MCP client
  - [x] SubTask 5.4: Implement timeout handling for tool calls (30s default)
  - [x] SubTask 5.5: Implement error mapping: Extension errors → MCP error responses
  - [ ] SubTask 5.6: Add unit tests for MCP tool schema validation and error mapping

- [x] Task 6: Implement Extension CDP Executor and Tool Registry
  - [x] SubTask 6.1: Create `packages/extension/src/background/cdp-executor.ts` — wrap `chrome.debugger.sendCommand` with attach/detach lifecycle
  - [x] SubTask 6.2: Create `packages/extension/src/background/command-router.ts` — route incoming commands to tool handlers
  - [x] SubTask 6.3: Implement `browser_list_tabs` tool — `chrome.tabs.query`
  - [x] SubTask 6.4: Implement `browser_select_tab` tool — activate tab + attach debugger
  - [x] SubTask 6.5: Implement `browser_navigate` tool — CDP `Page.navigate`
  - [x] SubTask 6.6: Implement `browser_snapshot` tool — CDP `Accessibility.getFullAXTree` + DOM summary
  - [x] SubTask 6.7: Implement `browser_click` tool — resolve selector/ref → CDP scroll into view → CDP dispatchMouseEvent
  - [x] SubTask 6.8: Implement `browser_fill` tool — CDP `DOM.focus` + `Input.dispatchKeyEvent` per character
  - [x] SubTask 6.9: Implement `browser_type` tool — CDP `Input.dispatchKeyEvent` sequence
  - [x] SubTask 6.10: Implement `browser_send_keys` tool — CDP `Input.dispatchKeyEvent` with key combinations
  - [x] SubTask 6.11: Implement `browser_screenshot` tool — CDP `Page.captureScreenshot`
  - [x] SubTask 6.12: Implement `browser_evaluate` tool — CDP `Runtime.evaluate` with permission check
  - [ ] SubTask 6.13: Add unit tests for command router and tool registry

- [x] Task 7: Implement Tool Risk Classification and Permission Policy
  - [x] SubTask 7.1: Create `packages/daemon/src/policy/permissions.ts` — define low/medium/high risk levels
  - [x] SubTask 7.2: Create `packages/daemon/src/policy/dangerous-actions.ts` — high-risk tools require explicit enable
  - [x] SubTask 7.3: Implement permission check in MCP tool call pipeline
  - [x] SubTask 7.4: Implement `PERMISSION_DENIED` error response for blocked tools
  - [ ] SubTask 7.5: Add unit tests for permission policy decisions

- [x] Task 8: Implement Session Manager and Tab Lease
  - [x] SubTask 8.1: Create `packages/daemon/src/session/session-manager.ts` — create/destroy sessions
  - [x] SubTask 8.2: Create `packages/daemon/src/session/tab-lease.ts` — acquire/release/renew with 10min TTL
  - [x] SubTask 8.3: Create `packages/daemon/src/session/request-queue.ts` — sequential execution for mutating tools
  - [x] SubTask 8.4: Implement lease conflict detection — return `TAB_LEASED_BY_OTHER_SESSION`
  - [x] SubTask 8.5: Implement auto-renew on activity and auto-release on TTL expiry
  - [x] SubTask 8.6: Handle `tab_closed` event from Extension to clean up leases
  - [ ] SubTask 8.7: Add unit tests for lease conflict, expiry, and cleanup

- [x] Task 9: Implement Extension Popup UI
  - [x] SubTask 9.1: Create popup UI with connection status, Daemon address, pairing state
  - [x] SubTask 9.2: Create pairing confirmation dialog
  - [x] SubTask 9.3: Implement high-risk tool toggle UI (e.g., `browser_evaluate` switch)
  - [x] SubTask 9.4: Implement pause/resume control button
  - [x] SubTask 9.5: Display recent operations log (sanitized)

- [x] Task 10: Implement Daemon CLI Commands
  - [x] SubTask 10.1: Create `packages/daemon/src/cli/serve.ts` — start MCP + WebSocket server
  - [x] SubTask 10.2: Create `packages/daemon/src/cli/doctor.ts` — check Node.js, port, extension, pairing, Chrome
  - [x] SubTask 10.3: Create `packages/daemon/src/cli/pair.ts` — initiate pairing flow
  - [x] SubTask 10.4: Create `packages/daemon/src/cli/reset-pairing.ts` — clear pairing data
  - [x] SubTask 10.5: Create `packages/daemon/src/cli/status.ts` — show daemon and extension status

- [x] Task 11: Create test pages and integration tests
  - [x] SubTask 11.1: Create `test-pages/form.html` — form with inputs and submit button
  - [x] SubTask 11.2: Create `test-pages/navigation.html` — links and navigation targets
  - [x] SubTask 11.3: Create `test-pages/dynamic-dom.html` — dynamically added elements
  - [x] SubTask 11.4: Create `test-pages/keyboard.html` — keyboard event targets
  - [ ] SubTask 11.5: Write integration tests: list tabs, navigate, snapshot, fill, click, screenshot
  - [ ] SubTask 11.6: Write integration tests: reconnect after daemon restart, Service Worker recovery

- [x] Task 12: Implement Visual Feedback (Optional)
  - [x] SubTask 12.1: Create `packages/extension/src/content/cursor-overlay.ts` — Shadow DOM cursor animation
  - [x] SubTask 12.2: Create `packages/extension/src/content/element-highlighter.ts` — highlight interactive elements
  - [x] SubTask 12.3: Implement pause control — reject all mutating tools when paused

# Task Dependencies

- Task 1 (monorepo skeleton) has no dependencies — start first
- Task 2 (Daemon WS Server) depends on Task 1
- Task 3 (Extension WS Client) depends on Task 1
- Task 2 and Task 3 can be developed in parallel
- Task 4 (Pairing Auth) depends on Task 2 and Task 3
- Task 5 (MCP Server) depends on Task 2
- Task 6 (CDP Executor + Tools) depends on Task 3
- Task 5 and Task 6 can be developed in parallel after their dependencies
- Task 7 (Permissions) depends on Task 5 and Task 6
- Task 8 (Session + Tab Lease) depends on Task 5 and Task 6
- Task 9 (Popup UI) depends on Task 3 and Task 4
- Task 10 (CLI Commands) depends on Task 2 and Task 5
- Task 11 (Integration Tests) depends on Task 5, Task 6, Task 7
- Task 12 (Visual Feedback) depends on Task 6, can be deferred
