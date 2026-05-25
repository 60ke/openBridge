# 浏览器桥接架构公开对比摘要

> 本文档只保留公开可观察的架构层面信息，用于说明 OpenBridge 的设计取舍。
> 不包含来自闭源产物内部分析的内容。

## 1. 对比范围

本文只讨论 AI 浏览器桥接系统中可以通过公开文档、公开权限声明、产品行为和用户可见交互推断出的架构差异：

- 浏览器扩展权限边界
- AI 客户端、daemon、扩展之间的通信模式
- Native Messaging、WebSocket、本地 HTTP API、MCP 的取舍
- 标签页、会话、授权、安全提示等产品层设计

本文不记录：

- 闭源扩展或本地程序的内部文件清单
- 闭源产物内部结构、代码或协议字段分析
- 精确包体积、精确代码行数或内部实现标识
- 非公开遥测、内部服务、内部实现细节

## 2. 可观察架构模式

### 2.1 Native Messaging 模式

部分浏览器桥接方案会使用 Chrome Native Messaging 让扩展和本地应用通信。

这种模式的特点是：

- 扩展通过浏览器提供的 Native Messaging 通道连接本地 host。
- 本地 host 通常由对应客户端或 CLI 安装和管理。
- 通信边界由浏览器和 native host 注册文件共同约束。
- 部署时需要处理不同操作系统的 native host 注册路径和安装流程。

优点：

- 不需要额外开放本地 HTTP 或 WebSocket 端口。
- 浏览器对 native host 有明确的注册和授权边界。
- 与特定客户端深度集成时体验可以很紧凑。

代价：

- 跨客户端复用较弱。
- 安装和排障通常更依赖平台细节。
- 对开源第三方集成来说，接入门槛较高。

### 2.2 Daemon + WebSocket 模式

另一类方案采用本地 daemon 作为中间层：

```text
AI 客户端 / Skill / MCP
        |
        | 本地 API 或 MCP stdio
        v
本地 daemon
        |
        | WebSocket
        v
浏览器扩展
        |
        v
真实浏览器标签页
```

这种模式的特点是：

- daemon 长期运行，负责管理连接、会话、工具调度和状态。
- 扩展通过 WebSocket 与 daemon 保持双向连接。
- AI 客户端可以通过 MCP、local API 或 skill 触发浏览器操作。
- 一个浏览器连接可以被多个本地 AI 工作流复用。

优点：

- 更容易服务多个 AI 客户端。
- daemon 可以集中管理端口、日志、健康检查、会话和工具权限。
- skill + local API 的体验可以接近“一次安装，后续自动可用”。

代价：

- 需要管理本地 daemon 的生命周期。
- 需要处理端口占用、自动重连、授权状态和日志排障。
- 扩展和 daemon 之间需要清晰的本机信任边界。

## 3. 权限边界

AI 浏览器桥接扩展通常至少需要：

- `tabs`：读取、创建、选择或关闭标签页
- `debugger`：通过 Chrome Debugger Protocol 执行底层页面操作
- `storage`：保存授权 token、设置和运行状态
- `alarms`：支持重连、心跳或周期任务

一些方案还会使用：

- `tabGroups`：把 AI 管理的标签页放入可见分组
- `windows`：管理浏览器窗口
- `activeTab`：获取当前活动标签的临时访问能力
- `scripting`：向页面注入脚本或视觉反馈层
- `nativeMessaging`：连接本地 native host

OpenBridge 的设计取向是：

- 优先保留浏览器控制所需的最小权限集合。
- 对高风险能力做显式开关，例如 JavaScript 执行。
- 用标签组和视觉反馈提升用户可观察性。
- 不引入与核心浏览器控制无关的大范围权限，除非有明确产品需求。

## 4. 通信模式对比

| 维度 | Native Messaging 模式 | Daemon + WebSocket 模式 |
|---|---|---|
| 浏览器到本地 | Chrome Native Messaging | WebSocket 到 loopback daemon |
| AI 到本地 | 通常绑定特定 CLI 或客户端 | MCP、local API、skill 均可 |
| 跨客户端复用 | 较弱 | 较强 |
| 安装复杂度 | 需要 native host 注册 | 需要 daemon 生命周期管理 |
| 端口问题 | 无本地端口 | 需要端口探测和 runtime 状态 |
| 用户可观察性 | 取决于客户端设计 | 可由 daemon、popup、doctor、logs 统一呈现 |

OpenBridge 选择 `daemon + extension + local API/MCP`，主要是为了：

- 让 Codex-style skill 可以直接调用本地 API。
- 保留 MCP 作为标准开放接口。
- 让浏览器连接和授权状态在本地 daemon 中统一管理。
- 让开源用户更容易检查、替换和扩展实现。

## 5. 会话与标签页设计

AI 控制真实浏览器时，标签页管理不是装饰功能，而是产品安全和可用性的核心。

推荐设计：

- 为每个任务或 agent session 分配 `sessionId`。
- 新开或接管的标签页记录到 session。
- 使用 Chrome 标签组给 AI 管理的标签页做可见标识。
- 支持 `close_session` 清理本次任务创建的标签页。
- `list_tabs` 返回标签页和分组信息，便于 AI 与用户共同确认状态。

OpenBridge 已按这个方向实现 session/tab group 管理，并把 runtime 状态写入 `.openbridge-data/runtime.json`。

## 6. 安全与信任边界

OpenBridge 的安全模型应坚持：

- daemon 只绑定本机回环地址。
- 扩展只连接本地 daemon。
- 首次授权后使用 token 自动重连。
- Popup 提供暂停控制和高风险能力开关。
- `browser_evaluate` 默认关闭。
- 安装脚本提供快速路径，同时 README 提供手动审查安装路径。
- pairing token、runtime 文件和日志不提交到 Git。

## 7. 对 OpenBridge 的结论

OpenBridge 采用本地 daemon、Chrome 扩展、local API/MCP 的三层架构，是为了在可用性、可观察性和开放集成之间取得平衡。

它不复制任何闭源实现的内部代码或内部实现细节，只吸收公开可观察的架构经验：

- daemon 作为长期运行的本地控制面
- WebSocket 作为 daemon 与扩展的双向通道
- local API/skill 作为默认顺滑入口
- MCP 作为标准互操作入口
- tab group/session 作为用户可见的任务边界
