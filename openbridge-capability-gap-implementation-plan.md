# OpenBridge 能力补齐实施计划

> 日期：2026-05-24
>
> 目标：把 OpenBridge 补齐到接近 Kimi WebBridge 的真实浏览器控制体验，并形成可分派、可实现、可验收的任务清单。
>
> 范围：本文只做规划与验收设计，不开始代码实现。

---

## 1. 当前结论

OpenBridge 当前已经具备基础链路：

```text
Codex / MCP Client
        │
        │ stdio MCP 或本地 HTTP API
        ▼
OpenBridge Daemon
        │
        │ ws://127.0.0.1:10087/bridge
        ▼
OpenBridge Chrome Extension
        │
        │ chrome.tabs / chrome.debugger / chrome.scripting
        ▼
Chrome Tab
```

当前能力可以完成：

- 列出标签页。
- 选择标签页。
- 新建标签页。
- 导航。
- 获取页面快照。
- 点击元素。
- 填写输入框。
- 键盘输入。
- 发送快捷键。
- 截图。
- 在用户打开开关后执行 JavaScript。

但和 Kimi WebBridge 对比，OpenBridge 仍缺少一批会直接影响真实使用体验的能力：

- 缺少标签组和颜色区分。
- 缺少 session 级 tab 生命周期管理。
- 缺少关闭 tab / 关闭 session。
- 缺少 find tab。
- 缺少网络请求观察。
- 缺少坐标点击。
- 缺少文件上传。
- 缺少导出 PDF。
- 缺少 navigate 后等待页面稳定。
- 快照返回过大，token 压力明显高于 Kimi。
- 工具返回结构还没有完全标准化。

这些能力需要补齐，否则 OpenBridge 只能算“能控制浏览器”，还不能算“像 Kimi 一样可稳定交给 Agent 长时间使用”。

---

## 2. Kimi 能力基线

参考 Kimi WebBridge 的公开架构信息，Kimi 当前暴露的主要浏览器工具包括：

```text
navigate
find_tab
evaluate
network
snapshot
click
fill
mouse_click
key_type
send_keys
screenshot
save_as_pdf
upload
close_tab
list_tabs
close_session
```

Kimi 扩展还具备一个重要体验设计：使用 Chrome `tabGroups` 把 Agent 创建或接管的标签页放入标签组，并通过颜色做区分。

已观察到的 Kimi 标签组逻辑：

```text
group title: agent:<session>
known colors:
  twitter -> blue
  xhs -> red
  zhihu -> blue
  worldquant -> purple
fallback colors:
  green / yellow / cyan / orange / pink / grey
```

Kimi 的 `list_tabs` 也会返回标签组标题。这个设计不是单纯的视觉装饰，它还支撑：

- 用户识别哪些标签页正在被 AI 控制。
- 多个 Agent session 并行时互不混淆。
- `close_session` 可以批量关闭或释放同一组标签页。
- 崩溃或重连后可以根据 group/session 恢复上下文。

---

## 3. OpenBridge 现状

OpenBridge 当前工具：

```text
browser_list_tabs
browser_new_tab
browser_select_tab
browser_navigate
browser_snapshot
browser_click
browser_fill
browser_type
browser_send_keys
browser_screenshot
browser_evaluate
```

当前扩展权限：

```text
tabs
activeTab
debugger
storage
alarms
scripting
```

当前缺失权限：

```text
tabGroups
windows
downloads
```

建议第一阶段只增加：

```text
tabGroups
windows
downloads
```

原因：

- `tabGroups`：支撑标签组、颜色、session 可视化。
- `windows`：支撑更准确的标签页、窗口、激活状态管理。
- `downloads`：支撑 PDF 导出和下载文件保存。

暂不建议引入 CodeX 那种大权限集合，例如 `history`、`bookmarks`、`sessions`、`topSites`、`readingList`。这些权限会扩大安全边界，不是补齐 Kimi 核心体验的必要条件。

---

## 4. 实施总原则

### 4.1 工具命名

对外 MCP 工具继续使用 `browser_` 前缀：

```text
browser_find_tab
browser_close_tab
browser_close_session
browser_network
browser_mouse_click
browser_upload
browser_save_as_pdf
```

扩展内部可以保持同名，也可以使用不带 `browser_` 的内部 command，但 Daemon 暴露给 MCP 的名称必须稳定。

### 4.2 返回格式

所有工具返回建议统一为：

```json
{
  "success": true,
  "data": {},
  "meta": {
    "tool": "browser_navigate",
    "tabId": 123,
    "sessionId": "default",
    "elapsedMs": 521
  }
}
```

失败统一为：

```json
{
  "success": false,
  "error": {
    "code": "TAB_NOT_FOUND",
    "message": "Tab not found: 123",
    "details": {}
  },
  "meta": {
    "tool": "browser_select_tab",
    "elapsedMs": 12
  }
}
```

目前已有工具可以逐步迁移，不要求一次性破坏兼容。

### 4.3 Session 语义

后续所有可能创建、选择、关闭标签页的工具都应该支持：

```json
{
  "sessionId": "optional-session-id",
  "groupTitle": "optional-visible-title",
  "groupColor": "optional-chrome-tab-group-color"
}
```

默认规则：

- 如果没有传 `sessionId`，使用 `default`。
- 如果没有传 `groupTitle`，使用 `agent:<sessionId>`。
- 如果没有传 `groupColor`，按固定颜色池轮询。
- 同一个 `sessionId` 下的标签页进入同一个 Chrome Tab Group。

---

## 5. P0：必须补齐的核心能力

### 5.1 标签组与颜色区分

目标：

- OpenBridge 创建或接管的标签页自动进入 Chrome Tab Group。
- 不同 session 使用不同颜色。
- `list_tabs` 返回 `groupId`、`groupTitle`、`groupColor`。

建议改动：

- `packages/extension/wxt.config.ts`
  - 增加 `tabGroups`、`windows` 权限。
- `packages/extension/chrome-globals.d.ts`
  - 补齐 `chrome.tabGroups` 类型。
  - 补齐需要的 `chrome.windows` 类型。
- `packages/extension/src/background/session/`
  - 新增 `tab-group-manager.ts`。
  - 管理 `sessionId -> groupId`、`sessionId -> color`。
  - 监听 `chrome.tabGroups.onRemoved` 清理缓存。
- `packages/extension/src/background/tool-registry/new-tab.ts`
  - 支持 `sessionId`、`groupTitle`、`groupColor`。
  - 新 tab 创建后加入对应 group。
- `packages/extension/src/background/tool-registry/select-tab.ts`
  - 支持可选 `sessionId`，接管已有 tab 时加入 group。
- `packages/extension/src/background/tool-registry/list-tabs.ts`
  - 返回 group 信息。
- `packages/daemon/src/mcp/schemas.ts`
  - 更新 `browser_new_tab`、`browser_select_tab`、`browser_list_tabs` schema。

验收：

1. 启动 daemon。
2. 重新加载 unpacked extension。
3. 调用：

```bash
curl -s -X POST http://127.0.0.1:10088/command \
  -H 'Content-Type: application/json' \
  -d '{"toolName":"browser_new_tab","args":{"url":"https://www.google.com","sessionId":"qa-a","groupTitle":"OpenBridge QA A"}}'
```

4. Chrome 中应出现一个名为 `OpenBridge QA A` 的标签组。
5. 再调用：

```bash
curl -s -X POST http://127.0.0.1:10088/command \
  -H 'Content-Type: application/json' \
  -d '{"toolName":"browser_new_tab","args":{"url":"https://www.bing.com","sessionId":"qa-b","groupTitle":"OpenBridge QA B"}}'
```

6. Chrome 中应出现第二个不同颜色的标签组。
7. `browser_list_tabs` 返回中每个相关 tab 应包含：

```json
{
  "groupId": 1,
  "groupTitle": "OpenBridge QA A",
  "groupColor": "blue"
}
```

失败判定：

- 新 tab 没有进入标签组。
- 两个不同 session 混入同一个 group。
- `list_tabs` 没有返回 group 信息。
- 扩展控制台出现 `Cannot read properties of undefined (reading 'tabGroups')`。

### 5.2 Navigate 支持 newTab 和页面加载等待

目标：

- `browser_navigate` 可以在当前 tab 导航，也可以创建新 tab 后导航。
- 导航完成后等待页面加载到可交互状态再返回。

建议参数：

```json
{
  "url": "https://www.google.com",
  "newTab": true,
  "sessionId": "qa-a",
  "groupTitle": "OpenBridge QA A",
  "waitUntil": "load",
  "timeoutMs": 15000
}
```

`waitUntil` 支持：

```text
none
domcontentloaded
load
networkIdle
```

第一版可以先实现：

- `none`
- `load`

建议改动：

- `packages/extension/src/background/tool-registry/navigate.ts`
  - 支持 `newTab`。
  - 支持 session group。
  - 使用 `chrome.tabs.onUpdated` 或 CDP `Page.loadEventFired` 等待加载。
  - 默认超时 15 秒。
- `packages/daemon/src/mcp/schemas.ts`
  - 更新 schema。

验收：

```bash
curl -s -X POST http://127.0.0.1:10088/command \
  -H 'Content-Type: application/json' \
  -d '{"toolName":"browser_navigate","args":{"url":"https://www.google.com/search?q=OpenBridge","newTab":true,"sessionId":"qa-nav","waitUntil":"load","timeoutMs":15000}}'
```

成功返回应包含：

```json
{
  "success": true,
  "url": "https://www.google.com/search?q=OpenBridge",
  "tabId": 123,
  "loaded": true
}
```

失败判定：

- 返回成功但页面仍是空白页。
- `waitUntil:load` 明显早于页面加载返回。
- 超时后没有清晰错误码。

### 5.3 Close Tab

目标：

- 支持关闭指定 tab。
- 如果关闭的是当前 attached tab，需要清理本地 attached 状态。

工具：

```text
browser_close_tab
```

参数：

```json
{
  "tabId": 123
}
```

建议改动：

- 新增 `packages/extension/src/background/tool-registry/close-tab.ts`。
- 注册到 `tool-registry/index.ts`。
- 更新 `packages/daemon/src/mcp/schemas.ts`。
- 更新 `packages/shared/src/permissions.ts`，风险等级 `MEDIUM`。

验收：

1. 新建 tab。
2. 调用 `browser_close_tab`。
3. `browser_list_tabs` 不再返回该 tab。

失败判定：

- 关闭后仍出现在列表。
- 关闭当前 tab 后后续命令错误不可恢复。

### 5.4 Close Session

目标：

- 关闭某个 session 下所有 OpenBridge 管理的标签页。
- 清理 session 对应 tab group 缓存。

工具：

```text
browser_close_session
```

参数：

```json
{
  "sessionId": "qa-a",
  "closeTabs": true
}
```

建议：

- 第一版只关闭 OpenBridge 创建或接管过的 tab。
- 不要关闭用户普通标签页。
- 如果一个 tab 没有被 OpenBridge 标记为 managed，不应被关闭。

验收：

1. 用同一个 `sessionId` 创建 2 个 tab。
2. 用另一个 `sessionId` 创建 1 个 tab。
3. 调用 `browser_close_session` 关闭第一个 session。
4. 前两个 tab 被关闭，第三个保留。

失败判定：

- 误关其他 session 或用户普通 tab。
- group 缓存残留导致下次 session 复用异常。

### 5.5 Find Tab

目标：

- 根据 URL、title、groupTitle、sessionId 查找标签页。

工具：

```text
browser_find_tab
```

参数：

```json
{
  "query": "google",
  "urlContains": "google.com",
  "titleContains": "Google",
  "sessionId": "qa-a",
  "activate": false
}
```

验收：

- 打开多个 tab 后能稳定返回匹配结果。
- `activate:true` 时激活第一个匹配 tab。

失败判定：

- 查找结果不包含 tabId、url、title。
- `activate:true` 没有切换到目标 tab。

---

## 6. P1：增强交互能力

### 6.1 Mouse Click 坐标点击

目标：

- 支持基于 viewport 坐标点击。
- 用于没有稳定 selector 或 snapshot ref 的页面。

工具：

```text
browser_mouse_click
```

参数：

```json
{
  "x": 320,
  "y": 240,
  "button": "left",
  "clickCount": 1
}
```

建议实现：

- 使用 CDP `Input.dispatchMouseEvent`。
- `mousePressed` + `mouseReleased`。
- 坐标按 CSS pixel 处理。

验收：

- 在测试页放置按钮，用坐标点击后页面状态变化。
- 对高 DPI 屏幕保持坐标准确。

### 6.2 Key Type 真实文本输入

目标：

- 区分 `browser_type` 和 `browser_key_type`。
- `browser_key_type` 更接近真实文本输入，优先使用 CDP `Input.insertText`。

工具：

```text
browser_key_type
```

参数：

```json
{
  "text": "hello world"
}
```

验收：

- 聚焦输入框后输入中文、英文、空格、符号。
- 输入结果与参数一致。

### 6.3 Upload 文件上传

目标：

- 支持给 `<input type="file">` 设置本地文件。

工具：

```text
browser_upload
```

参数：

```json
{
  "selector": "input[type=file]",
  "paths": ["/Users/k/Desktop/openBridge/test-pages/fixtures/sample.txt"]
}
```

建议实现：

- 使用 CDP `DOM.setFileInputFiles`。
- 需要先通过 selector 找到 node。

验收：

- 使用 `/Users/k/Desktop/openBridge/test-pages/file-upload.html`。
- 上传后页面能显示文件名。

失败判定：

- 文件路径不存在时没有清晰错误。
- 多文件 input 不支持数组。

### 6.4 Save As PDF

目标：

- 支持当前页面导出 PDF。

工具：

```text
browser_save_as_pdf
```

参数：

```json
{
  "path": "/Users/k/Desktop/openBridge/.openbridge-data/output/page.pdf",
  "printBackground": true
}
```

建议实现：

- 使用 CDP `Page.printToPDF`。
- 由扩展返回 base64 PDF。
- Daemon 本地 API 或 MCP shim 负责写入文件。

注意：

- Chrome 扩展 service worker 对本地任意路径写文件有限制，因此文件落盘最好放在 Daemon。
- 如果只走扩展能力，可先返回 base64，由调用端保存。

验收：

- 导出的 PDF 文件存在。
- 文件非空，且可被常见 PDF 工具识别。
- 可被 `file` 或 `pdfinfo` 识别为 PDF。

---

## 7. P1：网络观察能力

### 7.1 Network

目标：

- 支持开启、读取、清空当前 tab 的网络事件。
- 用于 Agent 判断 API 请求是否成功、页面是否有 4xx/5xx、登录状态是否异常。

工具：

```text
browser_network
```

建议 action：

```json
{
  "action": "start"
}
```

```json
{
  "action": "get",
  "limit": 100
}
```

```json
{
  "action": "clear"
}
```

建议返回：

```json
{
  "events": [
    {
      "type": "response",
      "url": "https://example.com/api",
      "status": 200,
      "method": "GET",
      "mimeType": "application/json",
      "timestamp": 1710000000000
    }
  ]
}
```

建议实现：

- 使用 CDP `Network.enable`。
- 监听：
  - `Network.requestWillBeSent`
  - `Network.responseReceived`
  - `Network.loadingFailed`
- 每个 tab 保留 ring buffer，默认最多 500 条。

安全边界：

- 默认不要返回 request body。
- 默认不要返回 response body。
- 如果未来要读 body，需要单独权限开关。

验收：

- 打开页面后 `browser_network start`。
- 访问 Google 搜索。
- `browser_network get` 能看到搜索页面相关请求和状态码。
- `clear` 后事件为空。

---

## 8. P1：快照压缩与可引用节点

### 8.1 Snapshot Compact Mode

目标：

- 降低 `browser_snapshot` 返回体积。
- 让 Agent 拿到更接近 Kimi 的可操作页面树。

当前问题：

- OpenBridge 返回原始 AXTree，内容大、层级杂、token 压力高。
- 对比测试中，OpenBridge snapshot 需要明显减少冗余节点，降低工具响应体积和上下文压力。
- OpenBridge 还没有稳定的可引用节点格式。

建议参数：

```json
{
  "mode": "compact",
  "maxNodes": 300,
  "includeHidden": false
}
```

建议返回：

```json
{
  "url": "https://www.google.com/search?q=test",
  "title": "test - Google Search",
  "nodes": [
    {
      "ref": "ax-12",
      "role": "textbox",
      "name": "Search",
      "value": "test",
      "clickable": true,
      "editable": true,
      "bounds": { "x": 10, "y": 20, "width": 500, "height": 40 }
    }
  ]
}
```

压缩规则：

- 去掉无 name、无 value、无动作能力的中间节点。
- 保留 button、link、textbox、checkbox、radio、combobox、menuitem 等可交互节点。
- 保留 heading、main、navigation、article 等结构节点。
- 为每个可操作节点生成稳定 `ref`。
- `browser_click` 支持用 `ref` 操作。

验收：

- Google 搜索结果页 snapshot 使用 compact 模式时应保持足够轻量，避免返回完整原始 AXTree。
- 搜索输入框、主要搜索结果链接、按钮都保留。
- `browser_click` 可以使用 snapshot 中的 `ref` 点击。

---

## 9. P2：体验与可维护性

### 9.1 Visual Cursor

目标：

- 页面上显示 AI 操作光标。
- 点击、输入、移动时用户能看到当前控制位置。

建议：

- 复用已有 `content/cursor-overlay.ts`。
- 每次 click、mouse_click、fill、type 前后通过 content script 更新位置。
- popup 提供开关。

验收：

- 点击时页面显示短暂光标或高亮。
- 关闭开关后不显示。

### 9.2 Popup 状态面板增强

目标：

- 显示 daemon 连接状态。
- 显示当前 session。
- 显示已启用危险能力。
- 提供 Pause / Resume。
- 提供 Allow JavaScript Execution 开关。

验收：

- daemon 停止时显示 disconnected。
- daemon 恢复后自动变 connected。
- 开关状态能同步到 daemon。

### 9.3 Doctor 和安装体验

目标：

- `openbridge doctor` 能检查所有常见问题。
- `install.sh` 尽量做到 Kimi 那种一条命令完成 CLI、skill、MCP shim、启动提示。

建议检查项：

- Node 版本。
- pnpm 是否存在。
- daemon 是否运行。
- local API 是否可访问。
- extension 是否连接。
- extension 版本是否匹配当前 build。
- Codex skill 是否安装。
- MCP 配置是否存在。

验收：

```bash
node packages/daemon/dist/cli/index.js doctor
```

应给出清晰 PASS/WARN/FAIL。

---

## 10. 分派建议

### 工程师 A：标签组和 session

负责：

- `tabGroups` 权限。
- tab group manager。
- `browser_new_tab` session 化。
- `browser_select_tab` 接管并分组。
- `browser_list_tabs` 返回 group 信息。
- `browser_close_session`。

交付：

- 代码实现。
- 至少 1 个本地手工验证记录。
- 更新 README 工具表。

### 工程师 B：tab 生命周期和查找

负责：

- `browser_close_tab`。
- `browser_find_tab`。
- navigate `newTab`。
- navigate `waitUntil`。
- attached tab 状态清理。

交付：

- 代码实现。
- 覆盖正常路径和 tab 不存在错误。

### 工程师 C：交互增强

负责：

- `browser_mouse_click`。
- `browser_key_type`。
- `browser_upload`。
- `browser_save_as_pdf`。

交付：

- 代码实现。
- 使用 `test-pages/` 增加或复用测试页。

### 工程师 D：network 和 snapshot compact

负责：

- `browser_network`。
- snapshot compact mode。
- snapshot `ref` 稳定化。
- click by ref 稳定化。

交付：

- 代码实现。
- Google 搜索页 snapshot 足够紧凑，保留关键可交互节点。
- network ring buffer 不泄漏敏感 body。

### 工程师 E：安装、doctor、文档

负责：

- `install.sh` 优化。
- `doctor` 检查项。
- README 工具表。
- OpenBridge Codex skill 更新。
- MCP config example 更新。

交付：

- 一条命令安装说明。
- 错误恢复说明。

---

## 11. 验收总流程

验收前准备：

```bash
cd /Users/k/Desktop/openBridge
pnpm install
pnpm typecheck
pnpm build
```

启动 daemon：

```bash
tmux new-session -d -s openbridge-daemon 'cd /Users/k/Desktop/openBridge && node packages/daemon/dist/cli/index.js serve 2>&1 | tee .openbridge-data/daemon.log'
```

检查状态：

```bash
node packages/daemon/dist/cli/index.js status
curl -s http://127.0.0.1:10088/health
```

浏览器准备：

- 重新加载 unpacked extension。
- 确认 popup 显示 connected / paired。
- 如果实现涉及新权限，需要在 Chrome 扩展页面确认权限已经更新。

基础验收：

```bash
curl -s -X POST http://127.0.0.1:10088/command \
  -H 'Content-Type: application/json' \
  -d '{"toolName":"browser_list_tabs","args":{}}'
```

核心验收矩阵：

| 能力 | 验收标准 |
|---|---|
| `browser_new_tab` | 能创建 tab，支持 session，进入 tab group |
| `browser_navigate` | 支持当前 tab / new tab，能等待 load |
| `browser_list_tabs` | 返回 tab 基础信息和 group 信息 |
| `browser_find_tab` | 能按 title/url/session 查询 |
| `browser_close_tab` | 能关闭指定 tab，状态清理正确 |
| `browser_close_session` | 只关闭目标 session 的 managed tabs |
| `browser_snapshot` | compact 模式足够轻量，保留关键可交互节点 |
| `browser_click` | 支持 selector 和 ref |
| `browser_mouse_click` | 坐标点击准确 |
| `browser_fill` | 输入框填写正确 |
| `browser_key_type` | 中文、英文、符号输入正确 |
| `browser_send_keys` | Enter、Cmd+A 等可用 |
| `browser_upload` | 文件 input 可成功设置文件 |
| `browser_screenshot` | 返回可解码图片 |
| `browser_save_as_pdf` | 能输出有效 PDF |
| `browser_network` | 能 start/get/clear，返回请求状态 |
| `browser_evaluate` | 默认关闭，打开开关后可用 |

---

## 12. Kimi 对比测试

验收完成后，需要做一次同场景对比。

测试场景：

```text
打开新标签页，在 Google 搜索：
IT类播客 采访 博主 排名
```

分别使用：

- Kimi WebBridge。
- OpenBridge。

记录：

```text
tool
latency_ms
response_bytes
approx_response_tokens = response_bytes / 4
success
error
```

建议步骤：

1. new tab / navigate。
2. snapshot。
3. 点击第一个自然搜索结果。
4. 截图。
5. close session。

达标目标：

- OpenBridge navigate 延迟不明显高于 Kimi。
- OpenBridge snapshot compact 返回体积接近或低于 Kimi。
- OpenBridge 能通过 tab group 明确区分自己的标签页。
- OpenBridge close session 后不残留测试 tab。

---

## 13. 下一步路线

建议按这个顺序推进：

1. 先做 P0 标签组、session、close、find、navigate wait。
2. 再做 P1 mouse click、upload、PDF、network。
3. 然后做 snapshot compact，降低 token 压力。
4. 最后做安装体验、doctor、popup 体验完善。

推荐第一轮交付边界：

```text
P0 全部完成
P1 中完成 mouse_click 和 upload
snapshot 增加 compact 参数但可以先不彻底压缩
```

第一轮交付后我来做校验：

- 读代码检查是否符合边界。
- 跑 `pnpm typecheck`。
- 跑 `pnpm build`。
- 重启 daemon。
- 重新加载扩展。
- 用 OpenBridge 实际控制 Chrome 完成 Google 搜索。
- 和 Kimi 做 latency / response size 对比。
- 输出验收报告和遗留问题清单。

---

## 14. 不建议本轮做的事

这些能力暂时不纳入本轮：

- 读取浏览器历史记录。
- 读取书签。
- 管理下载列表。
- 读取最近关闭标签页。
- 读取 Top Sites。
- 绕过验证码。
- 自动处理支付、转账、敏感授权。
- 默认读取 network request body / response body。
- 开放局域网或远程访问。

原因：

- 会显著扩大权限边界。
- 和 Kimi 核心体验无直接关系。
- 容易引入安全和隐私风险。

---

## 15. 交付 Definition of Done

每个能力完成时必须满足：

- Daemon schema 已更新。
- Extension tool registry 已注册。
- Permission policy 已更新。
- README 工具表已更新。
- Codex skill 已更新。
- 错误码清晰。
- `pnpm typecheck` 通过。
- `pnpm build` 通过。
- 至少一个 curl 本地验收命令可复现。
- 不要求用户手动 patch 配置文件才能使用。

整体验收通过标准：

- OpenBridge 能像 Kimi 一样打开带颜色标签组的新 tab。
- OpenBridge 能完成搜索、快照、点击、输入、截图、关闭 session 的完整链路。
- OpenBridge 和 Kimi 的能力差距只剩非核心增强项。
- 遇到 daemon 未启动、扩展未连接、权限未开启时，错误信息能指导用户修复。
