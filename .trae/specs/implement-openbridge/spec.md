# OpenBridge Spec

## Why

当前 AI 编程工具（Cursor、Claude Code、Codex、Windsurf 等）需要与用户正在使用的浏览器交互，但现有方案要么封闭（CodeX 仅限自有 CLI），要么无法访问用户登录态（Chrome DevTools MCP 只控全新实例），要么已停更（BrowserTools MCP）。OpenBridge 采用三层架构（MCP Daemon + Chrome Extension + Browser Tab），提供开放、标准化、安全的浏览器控制能力。

## What Changes

- 新建 pnpm monorepo 项目骨架（`packages/daemon`、`packages/extension`、`packages/shared`）
- 实现 Daemon：MCP Server（stdio）+ WebSocket Server + Session Manager + Tool Scheduler + Pairing Auth
- 实现 Chrome Extension：WebSocket Client + Tool Registry + CDP Executor + Popup UI + Reconnect
- 实现 Shared：协议类型定义、错误码、权限等级
- 实现 MVP 工具集：`browser_list_tabs`、`browser_select_tab`、`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_fill`、`browser_type`、`browser_send_keys`、`browser_screenshot`、`browser_evaluate`
- 实现配对认证机制：pairing secret + token 持久化 + Origin 校验
- 实现工具风险分级：低/中/高三级，高风险默认关闭
- 实现 Tab Lease：acquire/release/renew，冲突拒绝
- 实现视觉反馈（可选）：光标覆盖层、元素高亮、状态指示

## Impact

- Affected code: 全新项目，无现有代码影响
- 依赖：`@modelcontextprotocol/sdk`、`ws`、`zod`、`wxt`、`chrome.debugger API`

---

## ADDED Requirements

### Requirement: Monorepo Project Skeleton

系统 SHALL 提供 pnpm monorepo 项目结构，包含 `packages/daemon`、`packages/extension`、`packages/shared` 三个包。

#### Scenario: Build succeeds
- **WHEN** 执行 `pnpm install && pnpm build`
- **THEN** 所有包编译成功，无类型错误

#### Scenario: Shared types are importable
- **WHEN** daemon 或 extension 中 import shared 包的类型
- **THEN** TypeScript 编译通过，类型正确推断

---

### Requirement: Daemon WebSocket Server

Daemon SHALL 在 `127.0.0.1` 上启动 WebSocket Server，默认端口 10086，支持端口自动探测。

#### Scenario: Extension connects successfully
- **WHEN** Extension 向 `ws://127.0.0.1:10086/bridge` 发起 WebSocket 连接
- **THEN** 连接建立成功，Daemon 记录连接状态

#### Scenario: Non-loopback connection rejected
- **WHEN** 非 `127.0.0.1` 的客户端尝试连接
- **THEN** 连接被拒绝

---

### Requirement: Extension WebSocket Client with Reconnect

Extension SHALL 自动连接 Daemon WebSocket Server，并在断开后自动重连。

#### Scenario: Auto-reconnect after Daemon restart
- **WHEN** Daemon 重启导致连接断开
- **THEN** Extension 在 5 秒内自动重连

#### Scenario: Service Worker recovery
- **WHEN** Chrome 回收 Service Worker 后重新唤醒
- **THEN** Extension 通过 `chrome.alarms` + `chrome.storage.session` 恢复连接状态

---

### Requirement: Pairing Authentication

Extension 与 Daemon 之间 SHALL 实现配对认证机制，未配对连接不能执行任何浏览器命令。

#### Scenario: First connection requires pairing
- **WHEN** Extension 首次连接 Daemon
- **THEN** Daemon 返回 `pair_challenge`，Extension 在 Popup 中展示配对请求，用户确认后才建立信任

#### Scenario: Unpaired connection rejected
- **WHEN** 未配对的连接尝试发送 `command` 消息
- **THEN** Daemon 返回 `error`，消息类型为 `NOT_PAIRED`

#### Scenario: Invalid token rejected
- **WHEN** 连接携带错误或过期的 token
- **THEN** Daemon 拒绝命令，返回 `AUTH_FAILED`

#### Scenario: Reset pairing
- **WHEN** 用户执行 `openbridge reset-pairing`
- **THEN** 旧 token 失效，Extension 需要重新配对

---

### Requirement: MCP Server

Daemon SHALL 作为 MCP Server 通过 stdio 暴露工具给 AI 客户端。

#### Scenario: MCP client discovers tools
- **WHEN** MCP 客户端连接 Daemon
- **THEN** 返回所有已注册工具的名称、描述和 inputSchema

#### Scenario: MCP tool call routed to Extension
- **WHEN** MCP 客户端调用 `browser_navigate` 工具
- **THEN** Daemon 将请求转换为 `command` 消息发送给 Extension，等待 `command_result`，返回给 MCP 客户端

---

### Requirement: MVP Tool Set

系统 SHALL 提供以下 10 个 MVP 工具：

| 工具 | 风险等级 | 默认可用 |
|------|---------|---------|
| `browser_list_tabs` | 低 | 是 |
| `browser_select_tab` | 低 | 是 |
| `browser_navigate` | 中 | 是 |
| `browser_snapshot` | 低 | 是 |
| `browser_click` | 中 | 是 |
| `browser_fill` | 中 | 是 |
| `browser_type` | 中 | 是 |
| `browser_send_keys` | 中 | 是 |
| `browser_screenshot` | 低 | 是 |
| `browser_evaluate` | 高 | 否 |

#### Scenario: List tabs
- **WHEN** AI 调用 `browser_list_tabs`
- **THEN** 返回当前 Chrome 窗口的所有标签页信息（tabId、url、title）

#### Scenario: Navigate to URL
- **WHEN** AI 调用 `browser_navigate` 并传入 `{ url: "https://example.com" }`
- **THEN** 当前选中 tab 导航到指定 URL，返回导航结果

#### Scenario: Snapshot
- **WHEN** AI 调用 `browser_snapshot`
- **THEN** 返回当前页面的无障碍树摘要（Accessibility Tree），包含可交互元素的 ref 和描述

#### Scenario: Click element
- **WHEN** AI 调用 `browser_click` 并传入 `{ selector: "button[type=submit]" }` 或 `{ ref: "abc123" }`
- **THEN** 点击目标元素，返回操作结果

#### Scenario: Fill input
- **WHEN** AI 调用 `browser_fill` 并传入 `{ selector: "#name", value: "Alice" }`
- **THEN** 输入框被填充指定值，返回操作结果

#### Scenario: Screenshot
- **WHEN** AI 调用 `browser_screenshot`
- **THEN** 返回当前页面的截图（base64 编码）

#### Scenario: Evaluate blocked by default
- **WHEN** AI 调用 `browser_evaluate` 但未显式启用
- **THEN** 返回 `PERMISSION_DENIED` 错误

#### Scenario: Evaluate after enable
- **WHEN** 用户在 Popup 中启用 `browser_evaluate`
- **THEN** AI 可执行受控 JavaScript，返回执行结果

---

### Requirement: Tool Risk Classification

系统 SHALL 对所有工具实施风险分级策略。

#### Scenario: High-risk tool default off
- **WHEN** MCP 客户端调用高风险工具（`browser_evaluate`）
- **THEN** 默认返回 `PERMISSION_DENIED`，需用户显式授权

#### Scenario: Medium-risk tool default on
- **WHEN** MCP 客户端调用中风险工具（`browser_click`、`browser_fill` 等）
- **THEN** 默认允许执行

---

### Requirement: Tab Lease

系统 SHALL 实现 Tab Lease 机制，管理标签页的所有权和并发控制。

#### Scenario: Acquire lease
- **WHEN** Session 调用 `browser_select_tab`
- **THEN** 该 Session 获得 tab lease，lease TTL 为 10 分钟，有操作时自动续租

#### Scenario: Lease conflict
- **WHEN** Session A 持有 tab lease，Session B 尝试操作同一 tab
- **THEN** Session B 收到 `TAB_LEASED_BY_OTHER_SESSION` 错误

#### Scenario: Lease expiry
- **WHEN** tab lease 超过 TTL 且无操作续租
- **THEN** lease 自动释放，其他 Session 可获取

#### Scenario: Tab closed by user
- **WHEN** 用户手动关闭了被 lease 的 tab
- **THEN** Extension 发送 `tab_closed` event，Daemon 清理对应 lease

---

### Requirement: Request Queue

Daemon SHALL 对修改页面状态的工具调用实施请求队列，避免并发冲突。

#### Scenario: Sequential execution
- **WHEN** 两个 `browser_click` 请求同时到达
- **THEN** 按到达顺序依次执行，不并发

---

### Requirement: WebSocket Protocol

Daemon 与 Extension 之间 SHALL 使用结构化 JSON 消息通信。

#### Scenario: Hello handshake
- **WHEN** Extension 连接 Daemon
- **THEN** Extension 发送 `hello`（含 extensionVersion），Daemon 回复 `hello_ack`

#### Scenario: Heartbeat
- **WHEN** 连接空闲超过 30 秒
- **THEN** 双方互发 `heartbeat` 消息保活

#### Scenario: Command flow
- **WHEN** Daemon 发送 `command` 消息给 Extension
- **THEN** Extension 执行后返回 `command_result`，`requestId` 一一对应

#### Scenario: Event notification
- **WHEN** tab 被关闭或 debugger 意外 detached
- **THEN** Extension 主动发送 `event` 消息通知 Daemon

---

### Requirement: Extension Popup UI

Extension SHALL 提供 Popup 界面，显示连接状态、配对确认和权限管理。

#### Scenario: Connection status display
- **WHEN** 用户点击 Extension 图标
- **THEN** Popup 显示当前连接状态（connected/disconnected）、Daemon 地址、配对状态

#### Scenario: Pairing confirmation
- **WHEN** Daemon 发起配对请求
- **THEN** Popup 显示配对确认弹窗，用户确认后才建立信任

#### Scenario: High-risk tool toggle
- **WHEN** 用户在 Popup 中切换 `browser_evaluate` 开关
- **THEN** 该工具的可用状态立即更新

---

### Requirement: CLI Commands

Daemon SHALL 提供以下 CLI 命令：`serve`、`doctor`、`pair`、`reset-pairing`、`status`。

#### Scenario: Serve command
- **WHEN** 执行 `openbridge serve` 或 `npx @openbridge/daemon serve`
- **THEN** 启动 MCP Server + WebSocket Server

#### Scenario: Doctor command
- **WHEN** 执行 `openbridge doctor`
- **THEN** 检查 Node.js 版本、WebSocket 端口、Extension 连接、配对状态、Chrome 版本

---

### Requirement: Security Hardening

系统 SHALL 实施以下安全措施：

#### Scenario: Origin validation
- **WHEN** WebSocket 连接的 Origin 不属于扩展来源或空 Origin
- **THEN** 连接被拒绝

#### Scenario: Log sanitization
- **WHEN** 记录日志
- **THEN** 不记录完整页面文本、截图、Cookie、Authorization header

#### Scenario: Schema validation
- **WHEN** 接收到工具调用请求
- **THEN** 使用 zod schema 校验所有参数，非法参数返回校验错误

---

### Requirement: Visual Feedback (Optional)

Extension SHALL 可选注入内容脚本，提供视觉反馈。

#### Scenario: Cursor overlay
- **WHEN** AI 执行 `browser_click`
- **THEN** 页面上出现光标动画指示点击位置

#### Scenario: Element highlight
- **WHEN** AI 执行 `browser_snapshot`
- **THEN** 可选高亮页面可交互元素

#### Scenario: Pause control
- **WHEN** 用户点击暂停按钮
- **THEN** 所有修改型工具被拒绝，只读工具仍可用
