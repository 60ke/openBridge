# OpenBridge

[English README](./README.md)

OpenBridge 是一个本地浏览器桥接项目，用来让 AI Agent 控制用户真实的 Chrome 浏览器。它同时支持 MCP 客户端，也支持类似 Kimi WebBridge 的 skill + 本地 HTTP API 调用方式。

## 它能做什么

OpenBridge 采用类似 Kimi WebBridge 的三层架构：

```text
AI 客户端 / MCP 客户端 / Codex skill
        |
        | stdio MCP 或本地 HTTP API
        v
OpenBridge daemon
        |
        | ws://127.0.0.1:10087/bridge
        v
OpenBridge Chrome 扩展
        |
        v
用户真实 Chrome 标签页
```

daemon 是长期运行的本地服务，`openbridge mcp` 是一个轻量的 stdio MCP shim，会连接到已经运行的 daemon。这样一个浏览器连接可以被多个本地 AI 会话复用。

## 功能

- 通过 Chrome 扩展控制真实浏览器标签页
- 首次连接后自动授权，日常无需手动点击 Pair
- 只监听本机回环地址
- 支持 MCP stdio
- 支持通过本地 HTTP API 给 Codex-style skill 使用
- 创建、导航、选择、列出、关闭标签页
- 基于 session 的标签组和颜色区分
- 可引用节点的页面可访问性快照
- 点击、坐标点击、填写、输入、按键和快捷键
- 截图、导出 PDF、上传文件
- 网络请求事件观察
- Popup 中暂停控制，以及可选 JavaScript 执行权限

## 安装

```bash
./install.sh
```

安装脚本会：

- 安装依赖并构建 daemon、shared 包和扩展
- 在后台启动 OpenBridge daemon
- 为 Codex-style 客户端安装 `openbridge-webbridge` skill
- 输出 Chrome 扩展加载路径
- 保留 MCP 作为可选标准接口

然后在 Chrome 里加载 unpacked extension：

```text
packages/extension/.output/chrome-mv3
```

打开 `chrome://extensions`，开启开发者模式，选择 **Load unpacked**，然后选择上面的目录。

daemon 和扩展都启动后，扩展会自动授权连接。Popup 里应该显示 `Authorized`。之后 Codex 可以通过已安装的 skill 直接调用 `http://127.0.0.1:10088/command`，不要求 OpenBridge 一定出现在 MCP 服务列表里。

安装脚本参数：

```bash
./install.sh --no-skill
./install.sh --no-start
```

## 常用命令

```bash
node packages/daemon/dist/cli/index.js serve
node packages/daemon/dist/cli/index.js mcp
node packages/daemon/dist/cli/index.js status
node packages/daemon/dist/cli/index.js doctor
node packages/daemon/dist/cli/index.js reset-pairing
```

## 本地 API

daemon 默认在 `127.0.0.1:10088` 暴露本地 HTTP API。

健康检查：

```bash
curl -s http://127.0.0.1:10088/health
```

执行浏览器命令：

```bash
curl -s -X POST http://127.0.0.1:10088/command \
  -H 'Content-Type: application/json' \
  -d '{"toolName":"browser_list_tabs","args":{}}'
```

## MCP 配置

默认的顺滑体验走 `skill + daemon local API`。MCP 仍然保留，作为标准开放接口。

示例配置见 [openbridge-mcp-config.example.json](./openbridge-mcp-config.example.json)。

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

## 浏览器工具

当前支持：

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

## 安全模型

- daemon 只绑定本机回环地址。
- 扩展只连接本地 daemon。
- 可以在扩展 Popup 中暂停 AI 控制。
- `browser_evaluate` 默认关闭，需要用户显式开启。
- 配对 token 是本机运行态，不应该提交到仓库。
- `.openbridge-data/` 已加入 Git 忽略。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build
```

重新构建后，需要重新加载 unpacked extension：

```text
packages/extension/.output/chrome-mv3
```
