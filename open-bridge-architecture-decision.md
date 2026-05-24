# OpenBridge 架构决策文档

> **日期**：2026-05-22
>
> **目标**：设计一个开放的浏览器控制扩展，让任意 AI 工具（Cursor、Claude Code、Windsurf 等）都能通过标准协议控制用户正在使用的浏览器。

---

## 一、背景与动机

当前 AI 编程工具（Cursor、Claude Code、Windsurf 等）越来越需要与浏览器交互——调试前端、填写表单、截图验证、自动化测试等。但现有方案各有局限：

- **Chrome DevTools MCP**（Google 官方）：只能控制全新浏览器实例，无法访问用户已有的登录状态和 Cookie
- **CodeX**（OpenAI）：封闭生态，仅限 CodeX CLI 使用，其他 AI 工具无法接入
- **BrowserTools MCP**（AgentDeskAI）：已停更，架构冗余

我们需要一个**开放的、标准化的、能控制用户正在使用的浏览器**的方案。

---

## 二、现有方案调研

### 2.1 CodeX（OpenAI）— 两层架构

**架构**：

```
CodeX CLI (Rust) ──Native Messaging── Chrome Extension
```

**核心机制**：

- CLI 通过 `chrome.runtime.connectNative("com.openai.codexextension")` 与扩展建立双向通信
- 使用 JSON-RPC 2.0 协议，通过 stdin/stdout 传输
- 扩展是"胖客户端"（144KB），包含完整的会话管理、CDP 封装、光标覆盖层、Favicon 状态指示
- 三层重连保障：setTimeout 5s + chrome.alarms 30s + storage.session 持久化

**优势**：

| 方面 | 说明 |
|------|------|
| 安全性 | Native Messaging 有沙箱隔离，无端口暴露，同网络的人无法攻击 |
| 稳定性 | 重连机制完善，Service Worker 被销毁后也能恢复连接 |
| 视觉反馈 | 虚拟光标 + Favicon 状态指示，用户清楚知道 AI 在做什么 |
| 会话管理 | Tab Leases 系统，精确控制哪个会话拥有哪个标签页 |

**劣势**：

| 方面 | 说明 |
|------|------|
| 封闭性 | Native Host ID 硬编码为 `com.openai.codexextension`，只有 CodeX CLI 能连接 |
| 部署复杂 | 需要在系统中注册 Native Messaging Host 配置文件 |
| 不可扩展 | 工具定义在 Rust CLI 端，其他 AI 工具无法接入 |
| 平台限制 | 需要为每个操作系统编译 CLI 二进制 |

**关键源码验证**（来自 `/Users/k/Downloads/Chrome-Web-Store-Search-Results/`）：

- 扩展中 `NativeTransport` 类硬编码了 `com.openai.codexextension`
- manifest.json 声明了 `nativeMessaging` 权限
- `content_scripts: []` 为空数组，实际通过 `chrome.scripting.executeScript` 动态注入

### 2.2 Kimi WebBridge（月之暗面）— 三层架构

**架构**：

```
AI 工具 (Cursor/Claude) ──MCP stdio── Go Daemon ──WebSocket── Chrome Extension
```

**核心机制**：

- **守护进程**（Go，9.1MB）：WebSocket Server + 会话管理 + 工具调度 + 遥测上报
- **扩展**（28KB）：WebSocket Client + 工具注册表（16个工具）+ CDP 执行器
- 通信协议：自定义 JSON 消息（hello/hello_ack、tool_call/tool_result、ping/pong）
- 默认监听 `ws://127.0.0.1:10086/ws`

**优势**：

| 方面 | 说明 |
|------|------|
| 开放性 | 任意 MCP 兼容工具都可接入（Cursor、Claude Code 等） |
| 职责分离 | 扩展仅做 CDP 执行（28KB 瘦客户端），智能在守护进程（9.1MB） |
| 可扩展 | 工具注册表模式，新增工具只需添加一个类 |
| 标准化 | 通过 MCP 协议与 AI 工具通信，符合行业标准 |

**劣势**：

| 方面 | 说明 |
|------|------|
| 安全性 | WebSocket 连接未加密（ws://），同网络可监听 |
| 部署复杂 | 需要安装 9.1MB 的 Go 二进制守护进程 |
| 无视觉反馈 | 扩展不注入页面，用户看不到 AI 在做什么 |
| 会话管理粗粒度 | 仅跟踪标签页列表，无 Tab Leases 级别的所有权控制 |

**关键源码验证**（来自 `/Users/k/Downloads/Kimi-WebBridge-Chrome-Web-Store/` 和 `/Users/k/.kimi-webbridge/`）：

- 扩展实际有 16 个工具（navigate、find_tab、evaluate、network、snapshot、click、fill、mouse_click、key_type、send_keys、screenshot、save_as_pdf、upload、close_tab、list_tabs、close_session）
- 守护进程使用 `github.com/coder/websocket` 而非 `gorilla/websocket`
- 遥测通过 DataRangers SDK 上报至 `gator.volces.com`
- 守护进程内置会话清理：`"stale tab %d, removing from session"`

### 2.3 Chrome DevTools MCP（Google 官方）— 单层架构

**架构**：

```
AI 工具 ──MCP stdio── MCP Server (Puppeteer) ──CDP── 全新 Chrome 实例
```

**核心机制**：

- 通过 Puppeteer 启动全新 Chrome 实例，直接使用 CDP 控制
- 提供 44 个 MCP 工具（输入自动化、导航、性能分析、网络、调试、内存等）
- 配置极简：一行 JSON 即可使用

**优势**：

| 方面 | 说明 |
|------|------|
| 零安装 | 不需要扩展，不需要守护进程 |
| 标准化 | 完整 MCP 协议实现 |
| 功能丰富 | 44 个工具，覆盖调试、性能、内存等 |
| 官方维护 | Google Chrome DevTools 团队维护 |

**劣势**：

| 方面 | 说明 |
|------|------|
| 无登录状态 | 控制的是全新浏览器实例，无法访问用户已有的 Cookie 和登录态 |
| 无用户上下文 | 看不到用户正在浏览的页面 |
| 隐私风险 | 使用统计默认开启，发送至 Google |

### 2.4 BrowserTools MCP（AgentDeskAI）— 四层架构

**架构**：

```
AI 工具 ──MCP── MCP Server ──HTTP── Node Server ──WebSocket── Chrome Extension
```

**状态**：**项目已停更**（README 标注 "THIS PROJECT IS NO LONGER ACTIVE"）

**问题**：架构过于冗余，四层组件间通信效率低，且已不再维护。

---

## 三、架构选型分析

### 3.1 核心需求

| 需求 | 优先级 | 说明 |
|------|--------|------|
| 控制用户正在使用的浏览器 | P0 | 必须能访问用户的登录状态和 Cookie |
| 开放接入 | P0 | 任意 MCP 兼容的 AI 工具都能使用 |
| 标准协议 | P0 | 使用 MCP 协议，不发明私有协议 |
| 安全性 | P1 | 通信加密，权限验证 |
| 易部署 | P1 | 用户安装步骤尽量少 |
| 视觉反馈 | P2 | 用户能看到 AI 在做什么 |

### 3.2 方案对比

| 维度 | CodeX 两层 | Kimi 三层 | Chrome DevTools MCP | 合并 npm 包方案 |
|------|-----------|----------|-------------------|---------------|
| 控制现有浏览器 | ✅ | ✅ | ❌ | ✅ |
| 开放接入 | ❌ | ✅ | ✅ | ✅ |
| 标准协议 | ❌ JSON-RPC | ⚠️ 自定义 JSON | ✅ MCP | ✅ MCP |
| 安全性 | ✅ Native 沙箱 | ⚠️ ws:// 明文 | ✅ 本地进程 | ⚠️ ws:// 明文 |
| 部署复杂度 | 高 | 中 | 低 | 低 |
| 视觉反馈 | ✅ 光标+Favicon | ❌ | ❌ | 可选 |
| 扩展可维护性 | 低（144KB 压缩代码） | 高（28KB 清晰模块） | N/A | 高 |

### 3.3 为什么选择三层架构

**核心决策：采用 Kimi 的三层架构（守护进程 + 扩展 + MCP），并在此基础上改进。**

理由如下：

**1. 必须有 Chrome 扩展**

要控制用户正在使用的浏览器，唯一的方式是通过 Chrome 扩展的 `chrome.debugger` API。Puppeteer/CDP 直连只能控制全新实例。这是硬约束，无法绕过。

**2. 必须有中间层（守护进程）**

MCP 协议基于 stdio 传输，Chrome 扩展没有 stdin/stdout，无法直接实现 MCP Server。需要一个中间进程：
- 对上：作为 MCP Server，通过 stdio 与 AI 工具通信
- 对下：通过 WebSocket 与 Chrome 扩展通信

**3. 不选 Native Messaging 的原因**

CodeX 的 Native Messaging 虽然更安全，但：
- 每个 AI 工具都需要注册自己的 Native Host → 违背"开放接入"目标
- 部署复杂（需要写注册文件、编译平台特定的二进制）
- 与 MCP 生态不兼容（MCP 用 stdio，Native Messaging 也用 stdio，两者无法同时占用）

**4. 不选"合并 npm 包"方案的原因**

虽然部署更简单（一行 npx 搞定），但：
- 守护进程和 MCP Server 合并后，功能耦合严重
- 无法独立升级守护进程
- 无法支持多个 AI 工具同时连接（MCP stdio 是一对一的）
- 丧失了三层架构的职责分离优势

---

## 四、OpenBridge 架构设计

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI 工具层                                │
│  Cursor / Claude Code / Windsurf / Copilot / 任意 MCP 客户端    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ MCP (stdio)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     守护进程 (Daemon)                            │
│                    Node.js / Go 二进制                           │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ MCP Server  │  │ Session Mgr  │  │ WebSocket Server   │    │
│  │ (stdio)     │  │ - 标签页跟踪  │  │ ws://127.0.0.1     │    │
│  │             │  │ - 过期清理    │  │ :10086/ws          │    │
│  │ 工具定义    │  │ - 并发控制    │  │                    │    │
│  │ 权限校验    │  │              │  │ hello/hello_ack    │    │
│  └──────┬──────┘  └──────┬───────┘  │ tool_call/result   │    │
│         │                │          │ ping/pong          │    │
│         └────────┬───────┘          └─────────┬──────────┘    │
│                  │                            │               │
│         ┌────────┴────────┐                   │               │
│         │  Tool Scheduler │                   │               │
│         │  (请求路由/调度)  │                   │               │
│         └─────────────────┘                   │               │
└───────────────────────────────────────────────┼───────────────┘
                                                │ WebSocket
                                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Chrome 扩展 (Extension)                      │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ WS Client   │  │ Tool Registry│  │ CDP Executor       │    │
│  │ 自动重连    │  │ - navigate   │  │ chrome.debugger    │    │
│  │ 心跳保活    │  │ - click      │  │ .sendCommand()     │    │
│  │             │  │ - fill       │  │                    │    │
│  │ 消息路由    │  │ - screenshot │  │ 超时控制           │    │
│  │             │  │ - snapshot   │  │ 错误处理           │    │
│  │             │  │ - ...        │  │                    │    │
│  └─────────────┘  └──────────────┘  └────────────────────┘    │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐                             │
│  │ Popup UI    │  │ 连接状态管理  │                             │
│  │ 连接配置    │  │ 信任确认弹窗  │                             │
│  └─────────────┘  └──────────────┘                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │ CDP (Chrome Debugger Protocol)
                            ▼
                   ┌─────────────────┐
                   │  浏览器标签页     │
                   │  (用户正在使用的) │
                   └─────────────────┘
```

### 4.2 各层职责

| 层 | 组件 | 职责 | 参考 |
|----|------|------|------|
| **守护进程** | MCP Server | 暴露 MCP 工具给 AI，处理 stdio 通信 | Chrome DevTools MCP |
| **守护进程** | Session Manager | 跟踪标签页生命周期，过期清理 | Kimi 守护进程 |
| **守护进程** | WebSocket Server | 与扩展双向通信，消息路由 | Kimi 守护进程 |
| **守护进程** | Tool Scheduler | 请求排队、并发控制、超时管理 | CodeX lockedOperation |
| **扩展** | WebSocket Client | 自动连接/重连守护进程，心跳保活 | Kimi 扩展 |
| **扩展** | Tool Registry | 工具注册表模式，每个工具一个类 | Kimi 扩展 |
| **扩展** | CDP Executor | 封装 chrome.debugger API | CodeX 扩展 |
| **扩展** | Popup UI | 连接配置、状态显示、信任确认 | Kimi 扩展 |

### 4.3 通信协议

#### 扩展 ↔ 守护进程（WebSocket）

```json
// 扩展 → 守护进程
{ "type": "hello",         "payload": { "extensionVersion": "1.0.0" } }
{ "type": "tool_result",   "responseToRequestId": "xxx", "payload": { "data": {...} } }
{ "type": "ping" }

// 守护进程 → 扩展
{ "type": "hello_ack" }
{ "type": "tool_call",     "requestId": "xxx", "payload": { "name": "click", "args": {...} } }
{ "type": "pong" }
```

#### AI 工具 ↔ 守护进程（MCP stdio）

遵循 MCP 标准协议，工具定义示例：

```json
{
  "tools": [
    {
      "name": "browser_navigate",
      "description": "Navigate to a URL",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "description": "The URL to navigate to" }
        },
        "required": ["url"]
      }
    }
  ]
}
```

### 4.4 工具清单

基于 Kimi 扩展的实际工具列表（源码验证），加上必要的补充：

| 工具名 | 类别 | 说明 | 来源 |
|--------|------|------|------|
| `navigate` | 导航 | 导航到指定 URL | Kimi |
| `find_tab` | 导航 | 查找已打开的标签页 | Kimi |
| `snapshot` | 内容 | 获取页面无障碍树快照 | Kimi |
| `click` | 交互 | 通过选择器点击元素 | Kimi |
| `mouse_click` | 交互 | 通过坐标模拟鼠标点击 | Kimi |
| `fill` | 交互 | 填写表单字段 | Kimi |
| `key_type` | 交互 | 逐字符输入（触发事件） | Kimi |
| `send_keys` | 交互 | 发送键盘快捷键 | Kimi |
| `screenshot` | 视觉 | 截取页面或元素截图 | Kimi |
| `save_as_pdf` | 导出 | 导出页面为 PDF | Kimi |
| `upload` | 交互 | 上传文件 | Kimi |
| `close_tab` | 标签页 | 关闭标签页 | Kimi |
| `list_tabs` | 标签页 | 列出所有标签页 | Kimi |
| `close_session` | 会话 | 关闭当前会话 | Kimi |
| `evaluate` | 高级 | 执行 JavaScript 代码 | Kimi |
| `network` | 高级 | 捕获网络请求/响应 | Kimi |

### 4.5 安全设计

参考 Kimi 的安全警告机制（已验证存在于 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`）：

**1. 连接信任确认**

用户首次连接守护进程时，弹出信任确认弹窗：

> ⚠ 连接未加密（ws://），同网络的人可监听或篡改流量。
> 该服务将获得控制你浏览器的权限。
> 它能点击、打字、读取页面内容、操作标签页。
> 仅在你完全信任该服务端时继续。

**2. 默认仅本地监听**

守护进程默认监听 `127.0.0.1:10086`（仅本地回环），不暴露到网络。

**3. 未来支持 wss://**

预留 wss:// 加密连接支持，通过 TLS 证书加密 WebSocket 通信。

### 4.6 相对 Kimi 的改进点

| 方面 | Kimi 现状 | OpenBridge 改进 |
|------|----------|----------------|
| 工具数量 | 16 个 | 同等数量，按需扩展 |
| 视觉反馈 | 无 | 可选的光标覆盖层（参考 CodeX） |
| 会话管理 | 粗粒度（标签页列表） | 细粒度（Tab Leases，参考 CodeX） |
| 安全性 | ws:// 明文 | 默认 ws://，可选 wss:// |
| 开源 | 未开源 | 完全开源 |
| 遥测 | DataRangers 上报 | 默认关闭，用户可选开启 |
| 国际化 | en / zh_CN | 同等支持 |

---

## 五、部署流程设计

### 5.1 用户安装步骤

**第一步：安装 Chrome 扩展**

从 Chrome Web Store 安装 OpenBridge 扩展（一键安装）。

**第二步：安装守护进程**

```bash
# npm 全局安装
npm install -g @openbridge/daemon

# 或使用 Homebrew
brew install openbridge/tap/daemon
```

**第三步：配置 AI 工具**

在 Cursor / Claude Code / Windsurf 等工具的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "open-bridge": {
      "command": "openbridge-daemon",
      "args": ["serve"]
    }
  }
}
```

**第四步：启动**

```bash
# 启动守护进程
openbridge-daemon start

# 或通过扩展自动启动（扩展连接时自动拉起）
```

### 5.2 理想体验（未来）

守护进程通过 MCP 配置自动拉起，用户只需：

1. 安装扩展
2. 添加一行 MCP 配置

守护进程由 `npx @openbridge/daemon` 自动下载和启动，无需手动安装。

---

## 六、技术栈选择

| 组件 | 技术选择 | 理由 |
|------|---------|------|
| **守护进程** | Node.js (TypeScript) | 与 MCP 生态一致（MCP SDK 是 TypeScript），可复用 `@modelcontextprotocol/sdk`；用户无需安装 Go 环境；`npx` 一键启动 |
| **扩展** | TypeScript + WXT 框架 | WXT 是现代浏览器扩展开发框架，支持 HMR、TypeScript、多浏览器；CodeX 扩展也使用了 WXT（源码中发现了 `wxt/browser` 和 `wxt/storage` 引用） |
| **通信协议** | WebSocket + MCP | WebSocket 用于守护进程与扩展通信；MCP 用于守护进程与 AI 工具通信 |
| **CDP 封装** | chrome.debugger API | 扩展内直接调用，无需额外依赖 |

### 为什么守护进程选 Node.js 而不是 Go？

| 维度 | Node.js | Go |
|------|---------|-----|
| MCP 生态 | ✅ 官方 SDK 支持 | ❌ 需要自己实现 MCP |
| 部署方式 | ✅ npx 一键启动 | ❌ 需要编译平台特定二进制 |
| 包大小 | ~5MB (node_modules) | 9.1MB (静态链接) |
| 开发效率 | ✅ TypeScript 类型安全 | 需要编译 |
| 社区 | ✅ MCP 社区以 Node.js 为主 | 较少 MCP 相关库 |

---

## 七、项目结构规划

```
openbridge/
├── packages/
│   ├── daemon/                    # 守护进程
│   │   ├── src/
│   │   │   ├── mcp/               # MCP Server 实现
│   │   │   │   ├── server.ts      # MCP 服务端
│   │   │   │   └── tools.ts       # 工具定义
│   │   │   ├── ws/                # WebSocket Server
│   │   │   │   ├── server.ts      # WS 服务端
│   │   │   │   └── protocol.ts    # 消息协议
│   │   │   ├── session/           # 会话管理
│   │   │   │   └── manager.ts     # Session Manager
│   │   │   └── cli/               # CLI 命令
│   │   │       ├── start.ts
│   │   │       ├── stop.ts
│   │   │       └── status.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── extension/                 # Chrome 扩展
│   │   ├── src/
│   │   │   ├── background/        # Service Worker
│   │   │   │   ├── ws-client.ts   # WebSocket 客户端
│   │   │   │   ├── tool-registry/ # 工具注册表
│   │   │   │   │   ├── navigate.ts
│   │   │   │   │   ├── click.ts
│   │   │   │   │   ├── fill.ts
│   │   │   │   │   └── ...
│   │   │   │   └── cdp.ts        # CDP 执行器
│   │   │   ├── popup/             # 弹出面板
│   │   │   └── content/           # 内容脚本（可选光标层）
│   │   ├── package.json
│   │   └── wxt.config.ts
│   │
│   └── shared/                    # 共享类型和协议
│       ├── src/
│       │   ├── protocol.ts        # 消息协议定义
│       │   └── types.ts           # 共享类型
│       └── package.json
│
├── package.json                   # Monorepo 根配置
├── pnpm-workspace.yaml
└── tsconfig.json
```

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| WebSocket 明文通信 | 中 | 默认仅本地监听；未来支持 wss:// |
| 守护进程崩溃 | 高 | 扩展自动重连 + chrome.alarms 保活 |
| Service Worker 被销毁 | 中 | 参考 CodeX 的三层重连机制 |
| 并发工具调用冲突 | 中 | 守护进程内实现请求队列 |
| Chrome API 变更 | 低 | 使用稳定的 chrome.debugger API |

---

## 九、总结

选择三层架构（守护进程 + 扩展 + MCP）的核心逻辑：

1. **必须有扩展** → 才能控制用户正在使用的浏览器（硬约束）
2. **必须有守护进程** → 才能桥接 MCP stdio 和扩展 WebSocket（硬约束）
3. **必须用 MCP** → 才能让任意 AI 工具接入（开放性要求）
4. **不选 Native Messaging** → 与 MCP 不兼容，部署复杂，违背开放目标
5. **守护进程选 Node.js** → MCP 生态一致，npx 一键部署

这个架构在 Kimi WebBridge 已经验证可行的基础上，增加了开源、可选视觉反馈、细粒度会话管理等改进，同时保持了开放性和标准化。
