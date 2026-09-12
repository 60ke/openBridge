# 固定会话 Work Runner · 首版 POC

在 OpenBridge 上增加：**API 接单 → 指定 ChatGPT 会话 → 上传输入/提交 → 本次图片观察 → 截图复核 → 原图归档 → 上传与幂等回调**。

这是可测试的首版集成，**尚未在真实 ChatGPT Work 页面完成端到端验收**。页面选择器和工作模式需要校准，不能把单元测试通过当成网页登录、生成、下载已经通过。首次建议采用人工视觉复核和单张图任务。

## 1. 已实现与范围

- Chrome 设置页明确授权一个会话；每个新增工具以显式 tabId 操作，检查实际 URL。
- Python 3.11+ Runner、SQLite WAL、单进程锁、单会话串行任务、HTTP 本机鉴权接口。
- 随机 attempt 标识限定本次回复，拒绝覆盖人工草稿，发送前落盘，超时先核对而不是重发。
- 页面内容验证与候选稳定窗口；逐图截图；外部视觉检查器或人工批准。
- 跟踪浏览器原生下载，PNG/JPEG/WebP 实际解码、尺寸与 SHA-256 检查，截图与原图分开。
- 本地原子归档、成果 manifest、独立上传、SQLite 回调待发箱与失败重试。
- 可选出站领取远程任务与租约心跳。插件不需接收公网连接，Work 不需持有后端凭据。

**当前边界：**一个专用浏览器、一个固定会话、一个进行中任务；只交付图片，不是通用 Blender/CAD/ZIP 导出器。Chrome 需保持打开、已登录且已选正确工作模式。本版本不自动启动关闭的浏览器，不自动处理验证码、登录、安全确认、付款、任意弹窗或 Work 模式切换。不要让其他 Agent 同时控制这一个桥接连接。

新 Runner 使用 Python，原 OpenBridge daemon 与扩展仍使用 TypeScript。这样可复用原桥接并与后续 Blender/CAD 的 Python 工具衔接。

## 2. 安装开发分支

在仓库根目录按原 README 安装 pnpm/Node 后执行：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
node packages/daemon/dist/cli/index.js serve
```

Chrome 打开 `chrome://extensions`，启用开发者模式，加载本分支构建的：

```text
packages/extension/.output/chrome-mv3
```

商店版扩展不包含本分支的新工具，不能与这里的 Runner 混用。进入扩展的“详情 → 扩展程序选项”，配置目标会话，勾选任务操作授权及下载授权。默认不开启。

不要将 daemon 的 10088 端口或 debugger/CDP 暴露到公网。原有本机 API 并不是带公网认证的服务。安装授权不等于适用服务条款授权；不要绕过登录、验证码、使用限额或权限确认。

## 3. 配置并启动 Runner

```bash
cd packages/work-runner
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
python -m pip install -r requirements.txt
cp config.example.json config.local.json
```

Windows PowerShell 使用 `.venv\Scripts\Activate.ps1` 和 `Copy-Item config.example.json config.local.json`。

编辑 `config.local.json`：

| 字段 | 说明 |
|---|---|
| conversation_url | 与扩展授权地址一致；不要把个人会话 URL 提交 Git |
| bridge_url | 本机 daemon 地址；端口占用时可能不再是 10088，核对 /health 与 runtime.json |
| bridge_connection_id | 多个扩展连接时明确指定；不是 ChatGPT 会话 ID |
| tab_id | 同一会话有重复标签时明确指定；浏览器重启后 ID 可能改变 |
| input_root | 允许上传的本机文件目录，路径必须在此目录内部 |
| download_root | Chrome 实际下载根目录；默认配置为 ~/Downloads |
| data_dir | SQLite、截图、归档和 manifest 的私有目录 |
| selectors / mode_pattern | 根据真实页面校准；无法识别已选模式就暂停，不用万能正则掩盖问题 |
| visual_url | 可选，自己的视觉检查适配服务；未配置则必须人工批准 |
| backend_url | 可选，自己的任务/存储/回调服务；未配置仅本地完成 |
| claim_remote | 开启后主动向 backend_url 领取任务；输入暂需预先放到本机 input_root |

凭据只从环境变量读取：

```bash
export WORK_RUNNER_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
# 配置后端和视觉服务时再设置 WORK_BACKEND_TOKEN、WORK_VISUAL_TOKEN
python main.py --config config.local.json
```

PowerShell：

```powershell
$env:WORK_RUNNER_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(32))"
python main.py --config config.local.json
```

本机 API 默认 `127.0.0.1:10089`，所有请求需要 Bearer token，拒绝网页 Origin。不要用端口转发将其当公网服务。公共源码仅有占位地址，不含用户真实会话、截图、凭据或项目资料。

## 4. 提交第一个任务

编辑 `job.example.json`，先不上传附件，只生成一张图片：

```bash
curl http://127.0.0.1:10089/v1/jobs \
  -H "Authorization: Bearer $WORK_RUNNER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @job.example.json

curl http://127.0.0.1:10089/v1/jobs/image-poc-001 \
  -H "Authorization: Bearer $WORK_RUNNER_TOKEN"
```

相同 job_id 与相同内容返回原任务，内容变化报冲突。新实际任务必须使用新 job_id。任务不能指定回调地址、任意 JavaScript、选择器或凭据。

每条消息添加 `[openbridge-job:<attempt>]`，并请求最终回复包含 `[openbridge-done:<attempt>]`。本 POC 以完成标识、正确归属、无阻塞、图片齐全、稳定窗口共同构成候选；**只有图片而没有最终文字标识的回复，当前不会自动判定完成**。真实 Work 页面可能采用特殊成果卡、虚拟化列表或 iframe，需要继续适配；不要伪造 DOM 状态来让任务通过。

上传仅支持 Chrome 同机路径；`DOM.setFileInputFiles` 成功后仍会检查附件数量及上传进度。系统不会覆盖已有草稿或抢占人工输入。

## 5. 截图复核

未配置视觉服务时，任务停在 `awaiting_visual`，不会自动下载并冒称视觉通过。查看 `data_dir/jobs/<job>/<attempt>/evidence-*.png`，核对是否是本次图片、是否完整生成。截图只作证据，不当原图。

将 GET 返回的当前 candidate_digest 和 evidence 中的 SHA-256 按顺序填入 approval.json：

```json
{
  "candidate_digest": "<当前候选摘要>",
  "evidence_hashes": ["<对应截图SHA256>"],
  "decision": "passed",
  "reason": "人工核对本任务图片完整，无错误遮挡"
}
```

```bash
curl http://127.0.0.1:10089/v1/jobs/image-poc-001/approve \
  -H "Authorization: Bearer $WORK_RUNNER_TOKEN" \
  -H 'Content-Type: application/json' --data-binary @approval.json
```

`failed` 拒绝结果；旧候选、不同截图或被修改的证据不能批准。截图器要求单图完整在视口内；大图需调整显示比例。候选在审批后变化会暂停。

### 外部视觉服务协议

POST 到 visual_url：`job_id, attempt_id, candidate_digest, evidence_hashes, expected_images, screenshots[{sha256, artifact_key, base64}]`。

服务需实际调用视觉模型或人工检查，并返回同一个 `candidate_digest`、同序 `evidence_hashes`，以及 `decision: passed|failed|uncertain` 和非空 `reason`。这不是任意模型厂商 API 的直连格式，需你的适配服务。不要用固定 passed 的服务冒充验证。截图只发送到明确配置的地址；页面文字是待检查数据，不是给检查器的执行指令。

## 6. 后端协议

以下是本项目新增协议，不是 OpenBridge 或 OpenAI 原生端点：

- `PUT /v1/jobs/{job}/attempts/{attempt}/artifacts/{sha256}`：原图 bytes，带 MIME、X-Content-SHA256、Idempotency-Key。服务端实际校验并保存后返回 `{"sha256":"...","uri":"https://你的存储/不可变成果地址"}`。当前 uri 要求无凭据、无 query/fragment 的稳定 HTTPS 地址（本机测试可回环 HTTP）。
- `POST /v1/jobs/{job}/events`：事件带 `event_id, job_id, attempt_id, status`；成功包含 manifest；需人工包含 reason。服务端持久接受并按 event_id 去重后返回 `{"accepted":true,"event_id":"原事件ID"}`。只返回 200 不算应用层确认。
- `POST /v1/runners/{runner_id}/claim`：空队列返回 `{}`；有任务返回 `{"job":{...},"lease_token":"..."}`。job 字段与本地提交相同。服务端应对同 runner 的未决租约返回同一任务，避免网络断开造成重派。
- `POST /v1/jobs/{job}/heartbeat`：请求带 attempt_id、lease_token、phase；只有 `{"valid":true}` 才继续动作。暂时等待视觉检查也会续租。服务端必须校验 lease/attempt 防止过期执行覆盖新版本。

输入 URL 下载、云存储提供商 SDK、原生模型厂商适配、你的业务后端实现不在这一批范围。后端凭据取 WORK_BACKEND_TOKEN，禁止重定向转交凭据。回调无本机绝对路径、完整聊天、Cookie 或输入文件，但包含你填写的人工审核理由。

## 7. 状态及恢复

```text
queued → preparing → prepared → submitting → running
→ verifying → awaiting_visual / reviewed → downloading
→ uploading → callback_pending → succeeded

未配置后端：uploading → local_complete
异常：needs_human（保留 resume_phase）
```

HTTP 429、服务端错误或连接异常保留原阶段并延后重试；限额/验证码不绕过。上传失败只重试上传；回调失败只重试回调。发送意图在点击前保存，发送结果不确定时检查已有消息，绝不自动退回发送。

修复页面状态后可用 `{}` POST `/v1/jobs/{id}/resume` 恢复暂停阶段；它不会自动清除草稿、重新发送、忽略错误或重新绑定失去的标签。当前缺少取消/迁移交互界面；长任务、永久消失的标签或页面结构变化需要人工恢复，不应直接清库重派。

下载通过 Chrome downloads 状态查询，不将“出现链接”视为文件到齐。原生下载回退按单动作、短时间窗、允许的主机和 referrer 关联；多候选或证据不足暂停。**此回退仍需专用浏览器，不能与人工或其他任务同时下载。** 真正来源更丰富的成果卡尚需浏览器实测改进。

64 MiB 文件和 4000 万像素上限；PNG/JPEG/WebP 解码校验，不仅看扩展名。动画图片暂不接受。原图留在 Chrome 下载目录，同时另存私有工作目录。输出重复哈希会要求人工核对，不按名字去重。

`local_complete` 仅代表本地完成；`succeeded` 代表文件上传后，成功回调已被业务端明确确认。页面双路检查和文件解码都不等于工程尺寸、加工或结构复核。

## 8. 测试与验收

```bash
cd packages/work-runner
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
```

本批自动测试使用模拟桥接/后端、真实 SQLite、真实图像解码和本机 HTTP 服务，不登录 ChatGPT，不消耗账号额度。另由原仓库 CI 执行 TypeScript 类型检查和扩展构建。构建和测试通过也不等于实际站点兼容。

真实验收顺序：加载扩展并授权 → 校准 composer/mode/send/message/download/attachment 选择器 → 单图生成与人工截图审批 → 断连后的消息核对 → 下载归属检查 → 接视觉服务 → 接后端上传与回调 → 再考虑多图和 Blender/CAD 文件。不要在每轮检查中刷新正在执行的网页。
