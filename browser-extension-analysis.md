# Chrome 浏览器扩展逆向分析报告：CodeX vs Kimi WebBridge

> **生成日期**：2026-05-22
>
> **分析来源**：
> - `/Users/k/Downloads/Chrome-Web-Store-Search-Results/` — CodeX v1.1.5 解压包
> - `/Users/k/Downloads/Kimi-WebBridge-Chrome-Web-Store/` — Kimi WebBridge v1.9.7 解压包
> - `/Users/k/.kimi-webbridge/bin/kimi-webbridge` — Kimi WebBridge 守护进程二进制 v1.9.10

---

## 一、概述

两款扩展都是让 AI 能够控制浏览器的"桥接层"，但设计哲学和实现路径截然不同：

| | CodeX | Kimi WebBridge |
|---|-------|----------------|
| **开发者** | OpenAI | 月之暗面 (Moonshot AI) |
| **版本** | 1.1.5 | 1.9.7 |
| **Manifest** | V3 | V3 |
| **background.js** | 144 KB（约 5000+ 行） | 28 KB（约 800 行） |
| **有内容脚本** | ✅ 有（光标覆盖层） | ❌ 无 |
| **有 Side Panel** | ✅ 有 | ❌ 无 |
| **有 Native Messaging** | ✅ 有 | ❌ 无 |
| **有额外守护进程** | ❌ 无（CLI 直连扩展） | ✅ **有**（Go Daemon 9.1MB） |
| **国际化** | ❌ 无 | ✅ 支持 en / zh_CN |

---

## 二、目录结构与文件清单

### 2.1 CodeX — 目录结构

```
Chrome-Web-Store-Search-Results/
├── manifest.json                # V3 配置，20 个权限声明
├── background.js                # Service Worker（主逻辑）
├── popup.html                   # 弹出面板入口
├── content-scripts/
│   └── codex.js                 # 注入页面的内容脚本（光标覆盖层）
├── chunks/
│   └── popup-CTe__03-.js        # 弹出面板（React 应用）
├── assets/
│   └── popup-DzS88qVA.css       # 弹出面板样式
├── images/
│   ├── cursor-chat.png          # AI 光标图标（粉红色聊天气泡）
│   └── icon{16,32,48,128}.png
└── _metadata/
    └── verified_contents.json    # Chrome Web Store 校验元数据
```

### 2.2 Kimi WebBridge — 目录结构

```
Kimi-WebBridge-Chrome-Web-Store/
├── manifest.json                # V3 配置，7 个权限声明
├── background.js                # Service Worker（主逻辑）
├── popup.html                   # 弹出面板入口
├── chunks/
│   └── popup-BRDiPGz4.js        # 弹出面板（React 应用）
├── assets/
│   └── popup-BxuX4JPX.css       # 弹出面板样式
├── icon/
│   └── {16,32,48,128}.png
├── _locales/
│   ├── en/messages.json         # 英文本地化
│   └── zh_CN/messages.json      # 中文本地化
└── _metadata/
    └── verified_contents.json
```

**核心差异**：CodeX 多了一个 `content-scripts/` 目录和 `images/cursor-chat.png`，表明它有页面注入行为。

---

## 三、Manifest 权限对比

```json
// CodeX — 20 个权限
{
  "manifest_version": 3,
  "permissions": [
    "alarms", "bookmarks", "debugger", "downloads", "downloads.ui",
    "favicon", "history", "nativeMessaging", "notifications",
    "readingList", "scripting", "sessions", "storage",
    "tabGroups", "tabs", "topSites"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" }
}
```

```json
// Kimi WebBridge — 7 个权限
{
  "manifest_version": 3,
  "permissions": [
    "tabs", "activeTab", "debugger", "storage", "alarms",
    "tabGroups", "windows"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" }
}
```

| 权限 | CodeX | Kimi | 用途 |
|------|:-----:|:----:|------|
| `tabs` | ✅ | ✅ | 查询/创建/更新/关闭标签页 |
| `debugger` | ✅ | ✅ | Chrome 调试协议（底层操作页面） |
| `storage` | ✅ | ✅ | 持久化状态 |
| `alarms` | ✅ | ✅ | 定时任务（重连/心跳） |
| `tabGroups` | ✅ | ✅ | 标签组分组的读取操作 |
| `scripting` | ✅ | ❌ | 向页面注入脚本 |
| `nativeMessaging` | ✅ | ❌ | 连接本地 Native Host |
| `downloads` | ✅ | ❌ | 下载文件管理 |
| `history` | ✅ | ❌ | 浏览器历史记录访问 |
| `bookmarks` | ✅ | ❌ | 书签管理 |
| `sessions` | ✅ | ❌ | 最近的标签页/窗口会话 |
| `topSites` | ✅ | ❌ | 最常访问的站点 |
| `notifications` | ✅ | ❌ | 系统通知 |
| `favicon` | ✅ | ❌ | 标签页图标访问 |
| `readingList` | ✅ | ❌ | 阅读列表 |
| `activeTab` | ❌ | ✅ | 当前活动标签页的临时权限 |
| `windows` | ❌ | ✅ | 浏览器窗口管理 |

**结论**：CodeX 权限范围大得多（20 vs 7），因为它需要管理完整的浏览器会话生命周期——包括书签、历史记录、下载文件等。Kimi 采用最小权限原则，仅获取标签页和调试所需权限。

---

## 四、通信架构对比

### 4.1 CodeX：Native Messaging（深度绑定）

```
┌─────────────────────────────────────────────────────────────┐
│                        CodeX 整体架构                       │
├─────────────────────────────────────────────────────────────┤
                                                                   
 用户终端                          Chrome 浏览器                   
 ┌──────────┐   Native Messaging   ┌────────────────────────┐    
 │ CodeX CLI │ ◄─── stdin/stdout ──►│ Service Worker          │    
 │ (Rust)   │   JSON-RPC 2.0       │  ├─ NativeTransport     │    
 │          │                      │  │   (connectNative)    │    
 │ LLM Loop │                      │  ├─ TabManager          │    
 │          │                      │  ├─ SessionManager      │    
 │ 工具调用  │                      │  ├─ CDP Delegate       │    
 └──────────┘                      │  └─ Heartbeat (30s)    │    
                                       │                       
                                       │ chrome.runtime.sendMessage
                                       ▼                       
                                  ┌────────────────────────┐    
                                  │ Content Script (页面内)  │    
                                  │  └─ Shadow DOM 光标层    │    
                                  └────────────────────────┘    
```

**核心类**：`NativeTransport` (background.js)

```javascript
class NativeTransport {
  port = null;
  pendingHostRequests = new Map();  // 并发请求管理

  constructor(application = "com.openai.codexextension") {
    // 连接 Native Host
    this.port = chrome.runtime.connectNative(application);

    // 收到消息
    this.port.onMessage.addListener((msg) => {
      // JSON-RPC 响应路由
      if (!this.handleHostResponse(msg)) {
        this.messageCallback?.(msg);  // 转发给业务层
      }
    });

    // 断开自动重连（5 秒间隔）
    this.port.onDisconnect.addListener(() => {
      this.scheduleReconnect();
    });
  }

  // 发送 JSON-RPC 2.0 请求
  requestHost(method, params) {
    const request = {
      jsonrpc: "2.0",
      id: this.createHostRequestId(),
      method,
      ...(params !== undefined ? { params } : {})
    };
    this.port.postMessage(request);
  }
}
```

**重连机制**（三层保障）：
1. `setTimeout` 5 秒 — 短时间重试
2. `chrome.alarms` 每 30 秒 — Service Worker 被销毁后也能恢复
3. 持久化状态 — 利用 `storage.session` 记住是否需要重连

### 4.2 Kimi WebBridge：Go Daemon + WebSocket（三层架构）

**注意：Kimi 的实际架构比之前分析的更复杂。它并非扩展直连桌面端，而是在中间有一个独立的 Go 守护进程。**

```
 AI 工具端 (Cursor/Claude Code 等)     Kimi Desktop (Electron)
         │  MCP stdio                          │  WebSocket Client
         ▼                                     ▼
┌──────────────────────────────────────────────────────┐
│             Kimi WebBridge Daemon (Go)               │
│                   127.0.0.1:10086                     │
│  ┌──────────────────┐  ┌────────────────────────┐    │
│  │ WebSocket Server  │  │ Session Manager        │    │
│  │  (ws://.../ws)    │  │ - 标签页会话跟踪        │    │
│  │                   │  │ - 过期 tab 自动清理     │    │
│  │ 协议:             │  │ - 工具执行调度          │    │
│  │  hello/hello_ack  │  └────────────────────────┘    │
│  │  tool_call/result │                                │
│  │  ping/pong        │  ┌────────────────────────┐    │
│  └────────┬──────────┘  │ Telemetry (Kafka)      │    │
│           │             └────────────────────────┘    │
└───────────┼──────────────────────────────────────────┘
            │ WebSocket (ws://127.0.0.1:10086/ws)
            ▼
┌──────────────────────────────────────────────────────┐
│              Chrome Extension (Service Worker)        │
│  ┌──────────────────┐  ┌────────────────────────┐    │
│  │ WebSocket Client  │  │ Tool Registry (15个)    │    │
│  │ (coder/websocket) │  ├─ navigate / snapshot   │    │
│  │                   │  ├─ click / mouse_click   │    │
│  │ 消息路由:         │  ├─ fill / type / send_keys│   │
│  │  tool_call → 执行  │  ├─ screenshot / save_as_pdf│  │
│  │  result → 返回    │  ├─ upload / scroll       │    │
│  └────────┬──────────┘  ├─ list_tabs / close_tab │    │
│           │             ├─ dump_activity / close_session│
│           │             └────────────────────────┘    │
└───────────┼──────────────────────────────────────────┘
            │ CDP (Chrome Debugger Protocol)
            ▼
       浏览器标签页
```

**架构对比**：

| | CodeX | Kimi |
|---|-------|------|
| **层数** | 2 层：CLI ↔ 扩展 | **3 层**：AI 工具 ↔ **守护进程** ↔ 扩展 |
| **守护进程** | 无（CLI 通过 Native Messaging 直连） | ✅ Go Daemon（9.1MB，独立运行） |
| **AI 集成** | 仅限 CodeX CLI | 任意 MCP 兼容工具（Cursor/Claude Code 等） |
| **通信** | Native Messaging（扩展直连 CLI） | WebSocket（守护进程 ↔ 扩展）+ MCP stdio（AI ↔ 守护进程） |

关于扩展与守护进程之间的通信协议的更多详情，见下文 **第十节 守护进程逆向分析**。

---

## 五、内容脚本对比

### 5.1 CodeX：复杂的光标覆盖层

CodeX 向每个页面注入 `codex.js`，创建了一个 **Shadow DOM** 覆盖层，显示 AI 的操作光标：

```javascript
// content-scripts/codex.js 核心
const overlayRoot = document.createElement("div");
overlayRoot.id = "codex-agent-overlay-root";
const shadow = overlayRoot.attachShadow({ mode: "closed" });  // 封闭 Shadow DOM

// 创建光标元素
const cursorContainer = document.createElement("div");
cursorContainer.innerHTML = `
  <img src="${chrome.runtime.getURL("images/cursor-chat.png")}"
       style="filter: drop-shadow(...)" />
`;

// 监听来自 background 的光标位置
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "AGENT_CURSOR_STATE") {
    updateCursor(msg.state);
  }
});

// 光标到达目标后通知 background
function onCursorArrived(moveSequence) {
  chrome.runtime.sendMessage({
    type: "AGENT_CURSOR_ARRIVED",
    moveSequence, sessionId, turnId
  });
}
```

**光标动画**实现了复杂的物理模型：
- **弹性贝塞尔路径**：模拟鼠标的加速/减速运动
- **惯性回弹（scoot）**：到达目标时的过冲和回弹
- **方向跟随**：光标旋转角度随运动方向变化
- **思考抖动**：AI 思考时小幅度旋转动画
- **模糊光晕**：`drop-shadow` CSS 滤镜产生蓝色光晕效果

### 5.2 Kimi：无内容脚本

Kimi 选择了**零侵入**策略——不注入页面任何内容。所有交互都通过 CDP 在后台完成。这意味着：
- 不消耗页面内存
- 不被页面 JS 检测到
- 不干扰页面布局
- 但用户看不到 AI 的"操作过程"（没有视觉反馈）

---

## 六、Chrome 调试协议（CDP）使用对比

两者都深度依赖 CDP，但封装层次不同：

### 6.1 CodeX：统一 CDP 代理层

```javascript
// 统一的 CDP 命令执行函数（带超时控制）
function sendCdpCommand(target, method, params) {
  if (method === "Target.getTargets") {
    return chrome.debugger.getTargets();
  }
  return chrome.debugger.sendCommand(target, method, params);
}

// 带超时的版本
async function sendCdpWithTimeout(command, timeoutMs = 30000) {
  return Promise.race([
    sendCdpCommand(command),
    new Promise((_, reject) =>
      setTimeout(() => reject(new CdpCommandTimeoutError(command.method, timeoutMs)), timeoutMs)
    )
  ]);
}

// 调试器锁定（避免并发竞争）
const debuggerLock = new Map();
async function lockedOperation(tabId, fn) {
  const lock = debuggerLock.get(tabId) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  debuggerLock.set(tabId, lock.then(() => next));
  await lock;
  try { return await fn(); }
  finally { release(); }
}
```

### 6.2 Kimi：工具级 CDP 封装

Kimi 在每个工具工具类中独立编写 CDP 调用，更轻量但缺少统一抽象：

```javascript
// mouse_click 工具的 CDP 调用链
class MouseClick {
  async execute(args) {
    // 1. 附加调试器
    await attachDebugger(tabId);

    // 2. 获取元素的 objectId
    const objectId = await this.resolveObjectId(args.selector);

    // 3. 滚动到视口
    await cdp.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function() { this.scrollIntoView({ block: 'center' }); }`
    });

    // 4. 获取元素盒模型坐标
    const box = await cdp.send("DOM.getBoxModel", { objectId });
    const [x1, y1, x2, y2, x3, y3, x4, y4] = box.model.content;
    const cx = (x1 + x3) / 2, cy = (y1 + y3) / 2;

    // 5. 模拟鼠标移动 + 按下 + 释放
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left" });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left" });

    return { success: true, x: Math.round(cx), y: Math.round(cy) };
  }
}
```

### 6.3 CDP 命令使用范围

| CDP 命令 | CodeX | Kimi | 用途 |
|----------|:-----:|:----:|------|
| `Page.navigate` | ✅ | ✅ | 页面导航 |
| `Page.captureScreenshot` | ✅ | ✅ | 截图 |
| `Page.printToPDF` | ❌ | ✅ | 导出 PDF |
| `Runtime.evaluate` | ✅ | ✅ | 执行 JS |
| `Runtime.callFunctionOn` | ✅ | ✅ | 在 DOM 节点上执行函数 |
| `DOM.getDocument` | ✅ | ✅ | 获取 DOM 文档 |
| `DOM.querySelector` | ✅ | ✅ | CSS 选择器查元素 |
| `DOM.getBoxModel` | ✅ | ✅ | 元素盒模型坐标 |
| `DOM.resolveNode` | ✅ | ✅ | DOM 节点 → JS 对象 |
| `Input.dispatchMouseEvent` | ✅ | ✅ | 模拟鼠标事件 |
| `Input.dispatchKeyEvent` | ✅ | ✅ | 模拟键盘事件 |
| `Input.insertText` | ✅ | ✅ | 插入文本 |
| `DOM.setFileInputFiles` | ❌ | ✅ | 文件上传 |
| `Accessibility.getFullAXTree` | ❌ | ✅ | 无障碍树（内容提取） |
| `Emulation.setDeviceMetricsOverride` | ✅ | ❌ | 视口设置 |
| `Target.getTargets` | ✅ | ❌ | 获取所有可调试目标 |

---

## 七、Kimi 扩展的工具注册系统

Kimi 扩展实现了一个清晰的**工具注册表**模式，与 MCP（Model Context Protocol）概念一致：

```javascript
// 工具注册表
const toolRegistry = new Map();

// 注册单个工具
function registerTool(tool) {
  toolRegistry.set(tool.name, tool);
}

// 初始化所有工具
function initializeTools() {
  registerTool(new Navigate());       // 导航
  registerTool(new Snapshot());       // 页面快照
  registerTool(new Click());          // DOM 点击
  registerTool(new MouseClick());     // CDP 鼠标点击
  registerTool(new Fill());           // 填表单
  registerTool(new Type());           // 输入文字
  registerTool(new SendKeys());       // 键盘快捷键
  registerTool(new Screenshot());     // 截图
  registerTool(new SaveAsPdf());      // 导出 PDF
  registerTool(new Upload());         // 文件上传
  registerTool(new DumpActivity());   // 无障碍树
  registerTool(new Scroll());         // 滚动
  registerTool(new CloseTab());       // 关闭标签页
  registerTool(new CloseSession());   // 关闭会话
  registerTool(new ListTabs());       // 列出标签页
}

// 执行工具（工具名 + 参数）
async function executeTool(name, args) {
  const tool = toolRegistry.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(args);
}
```

**每个工具是一个独立的类**，有清晰的接口：
```typescript
interface Tool {
  name: string;          // 工具名（如 "screenshot"）
  execute(args: any): Promise<any>;  // 执行方法
}
```

CodeX 没有采用这种注册模式——它的工具由 CodeX CLI（Rust 端）定义，扩展只作为"CDP 命令执行器"。

---

## 八、会话与状态管理对比

### 8.1 CodeX：Tab Leases 系统

CodeX 有完整的 Session 生命周期管理：

```
会话状态机：

  active ───► handoff ◄──► deliverable ──► closed
    ↑            ↑
    └── 可切回 ──┘
```

- **Tab Leases**：AI 会话声明对标签页的所有权，防止冲突
- **Favicon Badge**：通过替换 favicon 显示标签页状态
  - 绿色圆点 = AI 正在操作
  - 黄色圆点 = 交接中（用户即将接管）
  - 黑色菱形 = 操作结果就绪
- **Turn ID**：每次对话轮次都有唯一 ID，支持并发操作
- **Heartbeat**：每 30 秒检测连接，断开时自动清理调试器

### 8.2 Kimi：守护进程内的会话管理

Kimi **不是完全无状态**——会话管理在守护进程中而不是在扩展中实现。从二进制逆向分析提取的会话管理结构：

```
守护进程内维护 Session Map:
  sessionID → {
    tabs:  [tabId1, tabId2, ...]  ← 追踪 AI 打开的标签页
    ...
  }

自动清理机制（从错误日志字符串推断）：
  "stale tab %d, removing from session"       → 过期标签页清理
  "stale tab %d in payload, removing from session" → 请求中的过期引用清理
  "session has no tab"     → 当前没有活跃标签页
  "session tab was closed" → 标签页已关闭
  "navigate or find_tab first" → 必须先导航再操作
```

对比 CodeX 的 Tab Leases：
- CodeX：**扩展端**维护 Leases，粒度到"哪个会话拥有哪个标签页"，有可视化 Favicon 指示
- Kimi：**守护进程端**维护 Session，粒度更粗（仅跟踪标签页列表），无视觉指示

---

## 九、Kimi WebBridge 守护进程二进制逆向分析

### 9.1 基本信息

| 属性 | 值 |
|------|-----|
| **路径** | `/Users/k/.kimi-webbridge/bin/kimi-webbridge` |
| **编程语言** | Go（静态链接，arm64 Mach-O） |
| **大小** | 9.1 MB |
| **版本** | v1.9.10 |
| **模块路径** | `dev.msh.team/harness/agent-extension` |
| **公共库** | `dev.msh.team/harness/agent-extension-common` |
| **版本注入方式** | `-ldflags="-s -w -X dev.msh.team/harness/agent-extension/internal/daemon.Version=v1.9.10"` |

### 9.2 使用的第三方库

| 库 | 用途 | 版本 |
|----|------|------|
| `github.com/coder/websocket` | WebSocket 客户端/服务端 | v1.8.14 |
| `github.com/spf13/cobra` | CLI 命令行框架 | v1.10.2 |
| `github.com/spf13/pflag` | 命令行参数解析 | v1.0.9 |
| `github.com/IBM/sarama` | Kafka 客户端（遥测上报） | 最新 |
| `go.uber.org/zapcore` | 结构化日志 | 最新 |

相比扩展，这里使用了 `coder/websocket`（非标准库）而非 `gorilla/websocket`。

### 9.3 从构建路径推断的源代码结构

```
/builds/harness/agent-extension/
├── cmd/
│   └── kimi-webbridge/
│       └── main.go                    # 程序入口
├── internal/
│   ├── cli/
│   │   └── daemon/
│   │       ├── install_skill.go       # MCP 技能安装
│   │       ├── start.go               # 启动守护进程
│   │       ├── stop.go                # 停止守护进程
│   │       ├── restart.go             # 重启
│   │       ├── status.go              # 状态查询
│   │       ├── logs.go                # 日志查看
│   │       ├── upgrade.go             # 升级管理
│   │       └── uninstall.go           # 卸载
│   ├── daemon/
│   │       ├── version.go             # 版本常量
│   │       ├── server.go              # WebSocket 服务端
│   │       ├── session.go             # 会话管理器
│   │       └── tool_*.go              # 各类工具实现
│   ├── lifecycle/
│   │       ├── daemonize_unix.go      # 后台进程化（fork）
│   │       ├── paths.go               # 目录路径管理
│   │       ├── logs.go                # 日志轮转管理
│   │       └── pid.go                 # PID 文件读写
│   └── telemetry/
│           └── ...                    # Kafka 遥测上报
```

### 9.4 守护进程磁盘结构

```
~/.kimi-webbridge/
├── bin/
│   └── kimi-webbridge          # 这个二进制文件
├── daemon.pid                   # 守护进程 PID（用于 stop/status 命令）
├── identity.json                # 唯一设备标识
└── logs/
    └── daemon.log               # 守护进程运行日志
```

### 9.5 端口与监听配置

```
默认监听:     127.0.0.1:10086  (仅本地回环，ws://)
开放网络:     0.0.0.0:10086   (所有接口，有安全风险)
stop/status:  始终连接 127.0.0.1:10086
WebSocket 端点: ws://{address}/ws
协议版本:     WebSocket 13 (RFC 6455)
```

内置安全警告：
> Listen address. Default binds loopback only. Use 0.0.0.0:10086 to expose on all interfaces (security risk: any client on the network can drive your browser). Note: stop/status always target port 10086; using a different port requires manual process management.

### 9.6 WebSocket 协议

扩展与守护进程之间的 WebSocket 消息协议：

```
扩展 → 守护进程（上行）:
  { "type": "hello",         "payload": { "extensionVersion": "1.9.7" } }
  { "type": "tool_result",   "responseToRequestId": "...",  "payload": { "data": ..., "error": ... } }
  { "type": "ping" }

守护进程 → 扩展（下行）:
  { "type": "hello_ack" }
  { "type": "tool_call",     "requestId": "...", "payload": { "name": "...", "args": {...} } }
  { "type": "pong" }
```

完整的工作流程：
```
1. 扩展连接守护进程
   ── hello(v1.9.7) ──────────►
   ◄── hello_ack ──────────────

2. 守护进程接收 AI 指令
   ◄── tool_call(navigate, {url:"..."}) ──

3. 扩展执行 CDP
   扩展调用 chrome.debugger.sendCommand(...)

4. 结果返回
   ── tool_result({data: {...}}) ──►

5. 心跳保活（双向）
   ── ping ──►
   ◄── pong ──
```

### 9.7 技能安装机制

`kimi-webbridge install-skill` 命令的逻辑：

```
下载 URL（从字符串提取）:
  https://cdn.kimi.com/webbridge/%s/skills/kimi-webbridge.tar.gz
  其中 %s = 版本号（如 "0.3.0"）

安装流程:
  1. 检测当前 AI 运行时（Cursor、Claude Code 等）
  2. 下载对应版本的 tar.gz 压缩包
  3. 解压到 AI 运行时的 MCP 配置目录
  4. 注册为 MCP 工具（工具定义描述了如何连接 ws://127.0.0.1:10086）
```

更新通道：
```
NPM:     npm update -g @kimi/webbridge
Homebrew: brew upgrade moonshot/kimi/webbridge
官网:    https://kimi-webbridge.moonshot.cn/download
CDN:     https://cdn.kimi.com/webbridge/latest/skills/kimi-webbridge.tar.gz
```

### 9.8 会话管理细节

守护进程内部维护的会话结构：

```go
// 从错误字符串推断的结构
type SessionManager struct {
  sessions map[string]*Session  // sessionID → Session
}

type Session struct {
  id        string
  tabs      []int               // 会话关联的标签页 ID 列表
  createdAt time.Time
}
```

自动清理规则：
- 发送 `tool_call` 引用到已关闭的标签页 → 从会话中移除 + 日志警告
- 接收 `tool_result` 引用到已关闭标签页 → 移除 + 日志警告
- 会话中没有任何标签页 → 后续操作报错（提示必须先 navigate 或 find_tab）

### 9.9 遥测系统

守护进程内置了基于 Kafka 的遥测上报系统：

```
依赖: github.com/IBM/sarama（Kafka Go 客户端库）

上报内容（从日志和配置推断）:
  - 设备 ID（来自 identity.json）
  - 操作统计（工具调用次数、成功率等）
  - 版本信息
  - 错误和异常
```

### 9.10 守护进程 vs 扩展的职责划分

```
                  ┌───────────────────┐
                  │  AI Agent 工具      │
                  │  (Cursor/Claude)   │
                  └────────┬──────────┘
                           │ MCP stdio
                           ▼
                  ┌───────────────────┐
                  │  Go Daemon (9.1MB) │  ← 智能层
                  │                    │
                  │  ├─ 会话管理        │
                  │  ├─ 工具调度        │
                  │  ├─ 遥测上报        │
                  │  ├─ 技能安装        │
                  │  ├─ 自动升级        │
                  │  └─ WebSocket 服务端│
                  └────────┬──────────┘
                           │ WebSocket (JSON)
                           ▼
                  ┌───────────────────┐
                  │  Chrome Extension  │  ← 执行层
                  │       (28KB)      │
                  │                    │
                  │  ├─ CDP 执行器      │
                  │  ├─ 工具实现(15个)  │
                  │  ├─ WebSocket 客户端│
                  │  └─ Popup UI       │
                  └────────┬──────────┘
                           │ CDP
                           ▼
                  ┌───────────────────┐
                  │    浏览器标签页     │
                  └───────────────────┘
```

**扩展（28KB）只是一个瘦 CDP 执行器，真正的智能在守护进程（9.1MB）里。**

---

## 十、与 CodeX 的完整架构对比

```
CodeX 架构:                          Kimi 架构:
┌──────────────────────┐            ┌──────────────────────┐
│ CodeX CLI (Rust)     │            │ AI Tools (Cursor/    │
│  ├─ LLM Agent Loop   │            │ Claude Code/Desktop) │
│  ├─ Tool Definitions │            │  └─ MCP stdio        │
│  └─ Native Host      │            └─────────┬────────────┘
│       (stdin/stdout) │                      │
└─────────┬────────────┘            ┌─────────┴────────────┐
          │ Native Messaging       │ Go Daemon (9.1MB)    │
          │ chrome.runtime.        │  ├─ Session Manager   │
          │ connectNative()        │  ├─ Tool Scheduler    │
          ▼                        │  ├─ Telemetry         │
┌──────────────────────┐            │  └─ WS Server :10086 │
│ Chrome Extension     │            └─────────┬────────────┘
│  ├─ NativeTransport  │                      │ WebSocket
│  ├─ CDP Delegate     │            ┌─────────┴────────────┐
│  ├─ Session Manager  │            │ Chrome Extension     │
│  ├─ Tab Leases       │            │  ├─ WS Client        │
│  ├─ Cursor Overlay   │            │  ├─ 15 Tools         │
│  └─ Favicon Badges   │            │  └─ CDP Executor     │
└──────────────────────┘            └──────────────────────┘
```

**关键架构性差异**：

| 方面 | CodeX | Kimi |
|------|-------|------|
| **中间层** | 无（CLI 直连扩展） | **Go Daemon** 作为中间层 |
| **AI 集成** | 专属 CodeX CLI | 通用 MCP（支持多工具） |
| **扩展职责** | 会话管理 + CDP 执行 + 视觉反馈 | 仅 CDP 执行 + 工具实现 |
| **守护进程职责** | 无（CLI 自己管） | 会话管理 + 工具调度 + 遥测 |
| **扩展大小** | 144KB（厚扩展） | 28KB（瘦扩展） |
| **二进制大小** | CodeX CLI 自有（Rust） | 9.1MB（Go） |
| **协议** | JSON-RPC 2.0 over Native Msg | JSON over WebSocket |

---

## 十一、总结与结论

### 设计哲学差异

```
CodeX  = "给浏览器装一个 AI 驾驶舱"
         全功能、高内聚、丰富的视觉反馈
         扩展承担大量逻辑，CLI 通过 Native Messaging 深度绑定

Kimi   = "给 AI 工具开一扇通往浏览器的门"
         极简、零侵入、通用 MCP 集成
         守护进程承担智能，扩展仅做 CDP 执行
```

### 选择建议

| 场景 | 推荐参考 |
|------|---------|
| 想构建完整的 AI Agent 浏览器控制系统 | 参考 **CodeX** 的 Tab Leases、Session 管理、光标反馈 |
| 想把现有 AI 产品快速接入浏览器控制 | 参考 **Kimi** 的轻量 WebSocket + Tool Registry + MCP 集成 |
| 需要 MCP 协议兼容 | 参考 **Kimi** 的守护进程 + 技能安装模式 |
| 需要跨 AI 工具兼容 | 参考 **Kimi**（支持 Cursor、Claude Code 等） |
| 需要本地隐私安全（不暴露端口） | 参考 **CodeX** 的 Native Messaging |
| 需要高安全性且无需安装额外二进制 | 参考 **CodeX** |

### 关键发现

1. **Native Messaging vs WebSocket**：CodeX 选择 Native Messaging 更安全（无端口暴露）但部署复杂（需要注册二进制）；Kimi 的 WebSocket 方案更简单但需要用户信任 ws:// 连接

2. **代码复用性**：Kimi 的工具注册系统（15 个 Tool 类）具有高度的模块化，理论上可直接移植到其他项目；CodeX 的代码与 OpenAI 生态系统深度耦合

3. **用户感知**：CodeX 的虚拟光标和 Favicon 角标提供了明确的"AI 正在做什么"的视觉反馈；Kimi 完全在后台操作，用户需要依赖 AI 界面中的文字描述来了解进展

4. **安全性考虑**：Kimi 的国际化字符串中明确包含了安全警告（信任确认弹窗），CodeX 则通过 Native Messaging 的沙箱机制来保证安全

5. **扩展 vs 守护进程职责划分**（本次逆向分析的核心发现）：
   - **Kimi**：扩展仅 28KB（瘦执行器），守护进程 9.1MB（逻辑大脑）。这种分离使得 Kimi 可以服务任意 MCP 兼容的 AI 工具
   - **CodeX**：扩展 144KB（厚客户端），CLI（Rust）直接驱动。全部逻辑在 CLI 中，扩展是全能型的"Agent Host"
   - **Kimi 的三层架构更具扩展性**，CodeX 的两层架构更紧凑