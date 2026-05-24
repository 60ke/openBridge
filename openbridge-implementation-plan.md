# OpenBridge 实施规划与验证设计

> 日期：2026-05-23
>
> 目标：规划一个开放的浏览器控制桥，让 Cursor、Claude Code、Codex、Windsurf 等任意 MCP 客户端，可以在用户授权后控制用户正在使用的 Chrome 浏览器。
>
> 当前阶段：规划与设计，不开始代码实现。

---

## 1. 设计结论

建议采用类似 Kimi WebBridge 的三层架构：

```text
AI 工具 / MCP Client
        │
        │ MCP stdio 或未来 Streamable HTTP
        ▼
OpenBridge Daemon / MCP Server
        │
        │ 本地 WebSocket + 配对认证
        ▼
OpenBridge Chrome Extension
        │
        │ chrome.debugger / chrome.tabs / chrome.scripting
        ▼
用户正在使用的 Chrome Tab
```

这个路线的核心优势是：

- 对 AI 工具开放：所有支持 MCP 的客户端都能接入。
- 对浏览器产品化：通过扩展接入用户当前浏览器，不要求用户手动用 remote debugging 模式启动 Chrome。
- 对权限可控：浏览器能力集中在扩展侧，适合做用户确认、状态展示、视觉反馈和权限分级。
- 对工程可维护：Daemon 管协议和调度，Extension 管浏览器执行，职责清晰。

需要避免的误区：

- 不把 Chrome DevTools MCP 描述成“做不到控制运行中的 Chrome”。它现在可通过 running Chrome / remote debugging 模式实现部分场景。
- 不把 Chrome 扩展描述成唯一技术路径。更准确的定位是：扩展路线是默认体验、权限治理和产品化控制最合适的路线。
- 不把 Native Messaging 描述成与 MCP 技术上不兼容。它的问题主要是安装注册成本、跨平台维护、开放接入体验和协议桥接复杂度。

---

## 2. 产品边界

### 2.1 OpenBridge 要解决的问题

OpenBridge 要让 AI 工具获得以下能力：

- 读取当前浏览器 tab 列表。
- 选择或创建一个 tab。
- 获取页面结构快照。
- 点击、输入、快捷键、上传文件。
- 截图验证页面状态。
- 导航、刷新、关闭 tab。
- 在用户允许的范围内执行 JavaScript。
- 未来支持网络请求观察、PDF 导出、视觉光标、细粒度 tab lease。

### 2.2 OpenBridge 不解决的问题

第一版不建议覆盖这些范围：

- 不做通用 RPA 平台。
- 不做跨浏览器完整兼容，先聚焦 Chrome / Chromium。
- 不做云端代理或远程浏览器控制。
- 不默认收集遥测。
- 不默认开放局域网访问。
- 不绕过网站登录、安全策略、验证码或用户确认。

---

## 3. 架构设计

### 3.1 Daemon 层

Daemon 是 OpenBridge 的开放入口，运行在用户本机。

职责：

- 作为 MCP Server 暴露工具给 AI 客户端。
- 管理与 Chrome Extension 的 WebSocket 连接。
- 管理 session、tab lease、请求队列、超时和取消。
- 做认证、权限校验、危险操作拦截。
- 将 MCP tool call 转换成扩展可执行的 browser command。
- 统一格式化错误、日志和诊断信息。

建议技术栈：

- Node.js + TypeScript。
- `@modelcontextprotocol/sdk`。
- `ws` 或更现代的 WebSocket 库。
- `zod` 做参数 schema 校验。
- `pnpm` monorepo。

Daemon 内部模块：

```text
packages/daemon/src/
├── cli/
│   ├── serve.ts
│   ├── doctor.ts
│   └── pair.ts
├── mcp/
│   ├── server.ts
│   ├── tools.ts
│   └── schemas.ts
├── bridge/
│   ├── websocket-server.ts
│   ├── protocol.ts
│   ├── pairing.ts
│   └── auth.ts
├── session/
│   ├── session-manager.ts
│   ├── tab-lease.ts
│   └── request-queue.ts
├── policy/
│   ├── permissions.ts
│   └── dangerous-actions.ts
└── diagnostics/
    ├── logger.ts
    └── health.ts
```

### 3.2 Extension 层

Extension 是浏览器权限执行层。

职责：

- 连接本地 Daemon。
- 显示连接状态、配对确认、权限提示。
- 执行浏览器操作。
- 获取页面快照、截图、tab 信息。
- 注入可选内容脚本，例如视觉光标和元素定位辅助。
- 在 Service Worker 被回收后恢复连接。

建议技术栈：

- TypeScript + WXT。
- Manifest V3。
- `chrome.debugger` 执行 CDP 命令。
- `chrome.tabs` / `chrome.scripting` / `chrome.storage` / `chrome.alarms`。

Extension 内部模块：

```text
packages/extension/src/
├── background/
│   ├── ws-client.ts
│   ├── reconnect.ts
│   ├── command-router.ts
│   ├── cdp-executor.ts
│   └── tool-registry/
│       ├── list-tabs.ts
│       ├── navigate.ts
│       ├── snapshot.ts
│       ├── click.ts
│       ├── fill.ts
│       ├── type.ts
│       ├── screenshot.ts
│       ├── evaluate.ts
│       └── close-tab.ts
├── content/
│   ├── cursor-overlay.ts
│   └── element-highlighter.ts
├── popup/
│   ├── App.tsx
│   └── pairing.tsx
└── shared/
    ├── protocol.ts
    └── permissions.ts
```

### 3.3 Shared 层

Shared 包保存 Daemon 和 Extension 都要使用的协议类型。

职责：

- 定义 WebSocket 消息类型。
- 定义工具参数和返回值类型。
- 定义错误码。
- 定义权限和风险等级。

---

## 4. 通信协议

### 4.1 MCP Client 到 Daemon

第一版使用 MCP stdio，原因是当前 Cursor、Claude Code、Codex 等本地工具普遍支持 stdio server 配置。

后续可增加 Streamable HTTP：

- 方便 Web UI、远程代理或多个 client 连接。
- 方便调试和集成测试。
- 需要更严格的认证和 CSRF 防护。

### 4.2 Daemon 到 Extension

使用本地 WebSocket：

```text
ws://127.0.0.1:<port>/bridge
```

默认策略：

- 只监听 `127.0.0.1`。
- 端口可配置，默认可从 `10086` 起自动探测。
- 每次安装或重置后生成 pairing secret。
- Extension 首次连接时要求用户确认。
- 每条请求携带 session id 和 request id。

### 4.3 WebSocket 消息

建议消息格式：

```json
{
  "version": 1,
  "type": "command",
  "requestId": "req_123",
  "sessionId": "sess_abc",
  "payload": {
    "name": "click",
    "args": {
      "tabId": 123,
      "selector": "button[type=submit]"
    }
  }
}
```

基础消息类型：

| 类型 | 方向 | 说明 |
|------|------|------|
| `hello` | Extension -> Daemon | 扩展启动后声明版本和能力 |
| `pair_request` | Extension -> Daemon | 请求配对 |
| `pair_challenge` | Daemon -> Extension | 返回配对挑战 |
| `pair_confirmed` | Extension -> Daemon | 用户确认配对 |
| `heartbeat` | 双向 | 保活和延迟检测 |
| `command` | Daemon -> Extension | 执行浏览器命令 |
| `command_result` | Extension -> Daemon | 返回执行结果 |
| `event` | Extension -> Daemon | tab 变更、连接状态、debugger detached |
| `error` | 双向 | 协议错误 |

---

## 5. 安全设计

### 5.1 威胁模型

需要防范：

- 本机恶意进程连接 Daemon 并控制浏览器。
- 恶意网页尝试访问 `localhost` WebSocket。
- 其他 MCP 客户端复用已有连接执行危险动作。
- AI 工具误操作敏感页面。
- Extension 被诱导在错误 tab 执行操作。
- 日志泄露页面内容、Cookie、token 或截图。

不作为第一版重点：

- 已经获得用户系统权限的恶意软件。
- 浏览器或 Chrome 扩展平台本身漏洞。
- 跨机器远程控制。

### 5.2 必做安全措施

第一版就要实现：

- Daemon 只 bind `127.0.0.1`。
- Extension 与 Daemon 配对后才接受命令。
- 使用随机 secret 或 session token。
- 校验 WebSocket `Origin`，只允许扩展来源或空 Origin 的受控本地客户端。
- 工具参数全部 schema 校验。
- 危险工具分级：
  - 低风险：`list_tabs`、`snapshot`、`screenshot`。
  - 中风险：`navigate`、`click`、`fill`、`type`。
  - 高风险：`evaluate`、`upload`、`close_tab`、未来的 cookie/storage 操作。
- 高风险工具默认需要显式启用。
- 日志默认脱敏，不记录完整页面文本和截图。
- Popup 中显示当前连接的 Daemon、客户端名称和最近操作。

### 5.3 可选增强

后续阶段实现：

- 每个 MCP client 单独授权。
- 每个 domain 单独授权。
- tab lease 到期自动释放。
- 视觉光标和操作提示。
- 一键暂停 AI 控制。
- 只读模式。
- 操作审计日志。
- `wss://` 支持，主要用于非 loopback 或企业场景。

---

## 6. 工具规划

### 6.1 MVP 工具

第一版建议只做最小闭环：

| 工具 | 说明 | 风险 |
|------|------|------|
| `browser_list_tabs` | 列出当前窗口和 tab | 低 |
| `browser_select_tab` | 选择当前会话要控制的 tab | 低 |
| `browser_navigate` | 导航到 URL | 中 |
| `browser_snapshot` | 获取可访问性树或 DOM 摘要 | 低 |
| `browser_click` | 通过 selector/ref 点击元素 | 中 |
| `browser_fill` | 填写输入框 | 中 |
| `browser_type` | 模拟键盘输入 | 中 |
| `browser_send_keys` | 发送快捷键 | 中 |
| `browser_screenshot` | 截图 | 低 |
| `browser_evaluate` | 执行 JS | 高，默认关闭或需要确认 |

### 6.2 第二阶段工具

| 工具 | 说明 | 风险 |
|------|------|------|
| `browser_find_tab` | 按标题、URL、domain 查找 tab | 低 |
| `browser_close_tab` | 关闭 tab | 高 |
| `browser_upload_file` | 文件上传 | 高 |
| `browser_save_pdf` | 保存页面 PDF | 中 |
| `browser_network_start` | 开始网络监听 | 中 |
| `browser_network_stop` | 停止网络监听 | 低 |
| `browser_console_messages` | 读取 console 日志 | 中 |

### 6.3 工具设计原则

- 工具名统一加 `browser_` 前缀。
- 参数尽量结构化，不接受任意拼接命令。
- 返回值包含 `tabId`、`url`、`title`、`timestamp`。
- 错误返回要可恢复，例如 `TAB_NOT_FOUND`、`ELEMENT_NOT_FOUND`、`PERMISSION_DENIED`。
- 对 selector/ref 双模式兼容：AI 可以基于 snapshot 返回的 ref 操作，也可以传 selector。
- 所有会修改页面状态的工具都走 session queue，避免并发冲突。

---

## 7. 会话与 Tab Lease

### 7.1 为什么需要 Tab Lease

多个 AI 工具或多个会话可能同时连接同一个 OpenBridge。如果没有 tab 所有权管理，可能出现：

- A 工具正在填写表单，B 工具导航走同一个 tab。
- 一个 session 关闭了另一个 session 正在使用的 tab。
- AI 操作落到用户刚刚切换到的敏感页面。

### 7.2 Lease 规则

建议规则：

- 每个 MCP client 初始化后创建一个 `sessionId`。
- session 可以 acquire 一个或多个 tab lease。
- lease 有 TTL，例如 10 分钟。
- 有操作时自动续租。
- lease 可显式 release。
- 高风险操作必须持有 tab lease。
- 如果 tab 被用户手动关闭，Extension 发送 `tab_closed` event，Daemon 清理 lease。

### 7.3 冲突处理

当另一个 session 想控制已被 lease 的 tab：

- 默认拒绝，返回 `TAB_LEASED_BY_OTHER_SESSION`。
- 允许用户在 Popup 中强制转移。
- 后续可支持只读共享 lease。

---

## 8. 实施阶段

### 阶段 0：项目骨架

产出：

- pnpm monorepo。
- `packages/daemon`。
- `packages/extension`。
- `packages/shared`。
- 基础 TypeScript、lint、test 配置。

验收：

- `pnpm install` 成功。
- `pnpm build` 成功。
- shared 类型可被 daemon 和 extension 引用。

### 阶段 1：本地连接闭环

产出：

- Daemon 启动 WebSocket server。
- Extension 自动连接 Daemon。
- hello / heartbeat / reconnect 协议。
- Popup 显示连接状态。

验收：

- 启动 daemon 后，扩展显示 connected。
- 停止 daemon 后，扩展显示 disconnected。
- 重启 daemon 后，扩展能自动恢复连接。
- Service Worker 被回收后，连接能恢复。

### 阶段 2：配对认证

产出：

- pairing secret。
- 首次连接确认。
- token 持久化。
- Origin 校验。

验收：

- 未配对扩展不能执行命令。
- 错误 token 被拒绝。
- 重置配对后旧 token 失效。
- 本地恶意 WebSocket 客户端不能无 token 调用命令。

### 阶段 3：MCP 最小工具

产出：

- MCP stdio server。
- `browser_list_tabs`。
- `browser_select_tab`。
- `browser_navigate`。
- `browser_snapshot`。
- `browser_screenshot`。

验收：

- Cursor / Claude Code / Codex 至少一个 MCP client 可连接。
- AI 能列出 tab。
- AI 能打开测试页面。
- AI 能获取 snapshot。
- AI 能截图并返回图片数据或文件路径。

### 阶段 4：交互工具

产出：

- `browser_click`。
- `browser_fill`。
- `browser_type`。
- `browser_send_keys`。
- 基础 request queue。

验收：

- 能打开本地测试页。
- 能填写输入框。
- 能点击按钮。
- 能触发表单 submit。
- 并发两个 click 请求时按顺序执行。

### 阶段 5：权限和高风险工具

产出：

- 工具风险分级。
- 高风险工具默认关闭。
- `browser_evaluate` 带权限确认。
- 审计日志雏形。

验收：

- 默认调用 `browser_evaluate` 返回 `PERMISSION_DENIED`。
- 用户开启后可执行受控 JS。
- Popup 显示最近高风险操作。
- 日志中不出现敏感完整 payload。

### 阶段 6：Tab Lease

产出：

- session manager。
- tab lease acquire / release / renew。
- tab 关闭和导航事件处理。

验收：

- 两个 MCP session 不能同时写同一个 leased tab。
- lease 过期后可被其他 session 获取。
- tab 被用户关闭后 lease 被清理。

### 阶段 7：体验增强

产出：

- 视觉光标。
- 元素高亮。
- Favicon 或 toolbar 状态提示。
- 一键暂停。

验收：

- AI 点击时用户能看到操作位置。
- 暂停后所有修改型工具被拒绝。
- 恢复后工具正常执行。

---

## 9. 验证方案

### 9.1 单元测试

Daemon：

- WebSocket protocol encode / decode。
- MCP tool 参数 schema。
- request queue 顺序。
- tab lease 冲突。
- permission policy。
- error mapping。

Extension：

- command router。
- tool registry。
- reconnect 状态机。
- permission decision。

Shared：

- 消息 schema 兼容性。
- 错误码枚举。

### 9.2 集成测试

使用本地测试页面：

```text
test-pages/
├── form.html
├── navigation.html
├── dynamic-dom.html
├── iframe.html
├── file-upload.html
└── keyboard.html
```

测试场景：

- 启动 daemon，加载 unpacked extension。
- 建立 WebSocket 连接。
- MCP client 调用工具。
- Extension 执行浏览器命令。
- Daemon 返回结构化结果。

重点用例：

- `list_tabs` 返回当前 tab。
- `navigate` 后 URL 正确。
- `snapshot` 包含按钮和输入框。
- `fill` 后 input value 正确。
- `click` 后页面状态变化。
- `screenshot` 返回非空图片。
- 断开 daemon 后扩展重连。
- Service Worker 重启后恢复连接。

### 9.3 端到端验证

至少验证这些客户端：

- Cursor。
- Claude Code。
- Codex。
- Windsurf，如本机可用。

每个客户端执行同一组验收 prompt：

```text
1. 列出我当前 Chrome 的标签页。
2. 打开本地测试页面。
3. 找到页面里的姓名输入框并填写 Alice。
4. 点击提交按钮。
5. 截图并确认结果区显示提交成功。
```

验收标准：

- 工具能被 MCP client 正确发现。
- 工具参数 schema 被客户端正确理解。
- 操作结果稳定返回。
- 出错时错误信息对 AI 可恢复。

### 9.4 安全验证

必须验证：

- 未配对不能调用命令。
- 错误 token 不能调用命令。
- 非 loopback 连接被拒绝。
- 高风险工具默认不可用。
- pause 状态下修改型工具不可用。
- 日志不记录完整截图、Cookie、Authorization header。
- WebSocket Origin 校验生效。

建议补充：

- 用浏览器页面直接尝试连接 `ws://127.0.0.1:<port>/bridge`，应失败或无法调用命令。
- 用脚本伪造 Extension hello，无 token 应失败。
- 多 session 抢同一个 tab，应返回 lease 冲突。

### 9.5 兼容性验证

Chrome 版本：

- 当前 stable。
- 当前 beta，如可用。
- Chromium 或 Edge，作为后续目标。

系统：

- macOS 优先。
- Windows 第二阶段。
- Linux 第二阶段。

页面类型：

- 普通页面。
- SPA。
- iframe 页面。
- out-of-process iframe 页面。
- 文件上传页面。
- 需要登录的真实站点，只做人工授权测试。

### 9.6 性能验证

指标：

- Daemon 冷启动时间。
- Extension 连接建立时间。
- `snapshot` 延迟。
- `click` / `fill` 延迟。
- screenshot 大小和耗时。
- 长时间运行内存占用。

初始目标：

- Daemon 冷启动小于 2 秒。
- Extension 重连小于 5 秒。
- 普通页面 snapshot 小于 1 秒。
- click / fill 小于 500ms，不含页面响应时间。
- 运行 1 小时无明显内存增长。

---

## 10. 发布与安装体验

### 10.1 第一版安装

建议第一版：

```json
{
  "mcpServers": {
    "openbridge": {
      "command": "npx",
      "args": ["-y", "@openbridge/daemon@latest", "serve"]
    }
  }
}
```

用户步骤：

1. 安装 Chrome Extension。
2. 在 AI 工具里添加 MCP 配置。
3. 第一次连接时在扩展 Popup 中确认配对。

### 10.2 CLI 命令

建议命令：

```bash
openbridge serve
openbridge doctor
openbridge pair
openbridge reset-pairing
openbridge status
```

### 10.3 Doctor 检查项

`openbridge doctor` 应检查：

- Node.js 版本。
- MCP stdio 是否正常。
- WebSocket 端口是否可用。
- Extension 是否连接。
- 当前配对状态。
- Chrome 版本。
- 必要权限是否已授予。

---

## 11. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 本机恶意进程连接 Daemon | 高 | pairing token、Origin 校验、loopback only |
| AI 误操作敏感页面 | 高 | tab lease、domain 授权、pause、一键断开 |
| Service Worker 被回收 | 中 | alarms、storage session、重连状态机 |
| 多 session 并发冲突 | 中 | request queue、tab lease |
| `evaluate` 滥用 | 高 | 默认关闭、显式授权、审计 |
| Chrome API 行为变化 | 中 | E2E 覆盖 stable/beta |
| MCP client schema 兼容差异 | 中 | 多客户端验收、简化 schema |
| 安装体验复杂 | 中 | npx 启动、doctor、清晰错误提示 |

---

## 12. 推荐后续行动

建议下一步按这个顺序推进：

1. 确认 MVP 工具清单和高风险工具策略。
2. 创建 monorepo 骨架。
3. 先实现 Daemon 和 Extension 的 hello / heartbeat / reconnect。
4. 再接入 MCP stdio 和 `browser_list_tabs`。
5. 用本地测试页面打通第一个完整闭环。
6. 在 Cursor、Claude Code、Codex 中各跑一次端到端验证。

第一阶段成功标准：

```text
AI 客户端可以通过 MCP 调用 OpenBridge，
OpenBridge 可以列出用户当前 Chrome tabs，
用户可以在扩展中看到连接状态，
未配对连接无法执行任何浏览器操作。
```

---

## 13. 决策记录

当前建议：

- 采用三层架构：MCP Daemon + Chrome Extension + Browser Tab。
- 第一版使用 MCP stdio。
- Daemon 使用 Node.js + TypeScript。
- Extension 使用 WXT + Manifest V3。
- Daemon 与 Extension 使用本地 WebSocket。
- 第一版必须实现配对认证，不接受裸 WebSocket 控制浏览器。
- 高风险工具默认关闭。
- Chrome DevTools MCP 作为参考对象和竞品，不作为替代实现。
- Native Messaging 暂不采用，可作为未来企业版或安全增强路线评估。

