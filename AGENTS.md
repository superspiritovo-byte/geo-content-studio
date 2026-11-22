# GEO 精准获客平台：开发与维护约定

本文件适用于整个项目，供后续编码代理接续开发。修改前先检查实际代码、README.md 和相关测试；不要将历史计划、截图或测试通过当作真实平台验收。用户当前明确指令优先于本文件。

## 产品范围与交互

- Windows 本机内部共享工作区，默认仅监听 127.0.0.1，不是公网 SaaS。
- 核心流程：企业资料 → AI 选题 → AI 草稿 → 人工编辑 → 发布确认 → 逐账号处理与核验。
- 主菜单包括工作台、企业资料、我的文章、发布账号和设置。保持中文界面、白色侧栏、浅灰背景、蓝色操作按钮和浅蓝提示区。
- AI 推荐监测与自动运营已按用户要求回退。保留基础内容生产、结构化输出与发布流程，后续恢复这两个模块需用户明确要求。原有监测及运营数据库表、豆包独立会话文件保留，不作删除。
- 正文默认使用可视化富文本编辑，内部仍可保存 Markdown。用户不希望编辑或发布时看到 `#`、`**`、列表标记等源码；保留标题、加粗、列表的实际格式，不能靠全局删除符号实现。
- 带格式复制提供 HTML 和纯文本；发布正文使用经过处理的 HTML，不直接向富文本编辑器填入 Markdown 源码。

## 技术与启动

- Next.js App Router、React、TypeScript、Node.js 24+；SQLite 使用原生 `node:sqlite`；Playwright 驱动独立 Chrome。
- 包管理使用 npm，依赖锁文件为 package-lock.json。
- 一键运行：双击 start.cmd，或运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1`。
- 一键启动默认地址：http://127.0.0.1:18080；PORT 可覆盖端口。scripts/launch.mjs 同时启动生产网页和发布工作进程。
- 开发：`npm run dev` 默认 3000 端口，另一个终端运行 `npm run worker`。
- 检查：`npm test`、`npm run typecheck`、`npm run build`。安装已有依赖使用 `npm ci`。
- 启动前检查现有服务和端口，不重复启动助手。构建或重启前检查正在处理的任务和未保存编辑。
- 只停止本项目拥有的进程；禁止批量结束所有 node、Chrome 或 Edge 进程。后台辅助进程使用隐藏窗口。
- Node 24 的 SQLite ExperimentalWarning 本身不表示失败。

## 代码入口

| 文件 | 职责 |
| --- | --- |
| src/components/studio.tsx | 主界面、五个菜单、写作与发布流程 |
| src/app/[[...slug]]/page.tsx | 页面路由入口 |
| src/app/api/[...path]/route.ts | 状态读取、操作分发、输入校验、本机访问与请求来源限制 |
| src/lib/types.ts | 平台、账号、文章、发布任务类型 |
| src/lib/store.ts | SQLite、事务、资料隔离、文章快照、幂等与任务状态 |
| src/lib/ai.ts | 真实模型请求、上下文容量检查、结构化结果 |
| src/lib/secrets.ts | Windows 当前用户 DPAPI 密钥保护 |
| src/worker.ts | 顺序处理助手命令和发布任务、心跳与中断恢复 |
| src/lib/adapters.ts | 知乎、百家号、搜狐号文章适配与平台分发 |
| src/lib/creator-identity.ts | 百家号、搜狐号身份解析 |
| src/lib/image-adapters.ts | 小红书、抖音、B站身份与图文辅助填入 |
| src/lib/image-identity.ts | 图文平台身份响应解析 |
| src/lib/image-post.ts | 图文文案转换、平台限制与校验 |
| src/lib/publishing.ts | Markdown 渲染、链接约束、作者和全文核验 |
| src/components/rich-body.tsx、src/lib/rich-body.ts | 富文本编辑与 Markdown 转换 |
| src/components/copy-body.tsx | 复制带格式正文 |
| src/components/image-post-form.tsx | 图文标题、正文、图片顺序与上传状态 |
| tests/ | 数据、API、身份、发布核验和格式转换测试 |
| docs/progress.md | 实施进展与历史问题记录 |

## 本机数据与敏感信息

- 默认数据根目录：`%LOCALAPPDATA%\GEOStudio\data`，独立于 OneDrive 项目目录。
- GEO_DATA_DIR 可指定其他目录，网页与助手必须使用相同值。测试必须设置独立临时目录。
- geo.sqlite 保存业务数据；documents/ 保存上传原文件；covers/ 保存封面及图文图片；profiles/ 保存会话；logs/ 保存日志。
- Chrome 账号目录为 `profiles/chrome/<账号ID>`。用户明确要求 Google Chrome，不应默认改回 Edge。
- 不访问或复制用户日常浏览器资料、Cookie、登录令牌。旧 Edge 目录保留，不能直接混用登录资料。
- API 密钥使用 DPAPI CurrentUser 加密，前端只知道是否已保存。禁止回显完整密钥、密文或认证令牌；诊断不能解密打印密钥。
- 不将数据库、会话目录、上传文件、真实账号响应、密钥或测试产物提交到版本控制。
- 不为修复问题而删除真实数据或重置账号。备份应先停止网页和助手；换 Windows 用户或电脑可能需要重新填写密钥并登录。

## AI 与资料边界

- 支持 TXT、Markdown、DOCX 与粘贴文字，每份资料最多 10 个文件、每个 8MB；不宣称已支持直接解析 PDF。
- 生成仅使用选中资料库中成功解析的文本，失败文件不能进入上下文，不混入其他企业资料。
- 使用设置页配置的真实 Chat Completions 兼容接口，不提供伪造选题或文章来掩盖连接失败。
- 容量超限明确提示精简，不静默截断；事实核对清单与文章正文分开。
- 修改模型调用应保留超时、结构校验和可理解的错误提示。连接测试可能产生真实费用，常规测试优先使用本机模拟服务。

## 账号身份识别

- 登录身份、发布资格、提交成功和公开发布是不同状态，不得混为一谈。
- 身份必须有可核对的姓名与稳定账号标识；昵称相同不代表同一个账号，也不能从任意他人主页推断登录身份。
- 多标签页应定位对应平台会话，不固定读取第一个标签页。沿用平台自己的登录态读取身份，只输出必要的脱敏字段。
- 知乎使用当前用户接口 `/api/v4/me`；自己的主页回退需有“编辑个人资料”等自有身份依据。
- 百家号可从账号设置页读取姓名与百家号 ID；该 ID 不可直接当作公开作者 app_id。
- 搜狐号应区分普通搜狐用户与 mp.sohu.com 创作者。身份响应来自 `/mpbp/bp/account/listV2`，账号审核或实名限制应单独记录为发布资格，不应把已识别身份显示成未登录。
- 小红书当前身份接口为 `/api/galaxy/user/info`，关注 userName、userId。
- 抖音当前 PC 接口 `/aweme/v1/creator/pc/user/info/` 提供 uid；`/aweme/v1/creator/user/info/` 提供 user_profile.nick_name。组合身份时重新检查 uid，不能假定两个接口字段结构相同。
- B站使用导航身份接口 `/x/web-interface/nav` 的 isLogin、uname、mid。
- 平台接口与页面会变化，以上路径是排查入口，不能代替检查当前真实响应与测试。不要硬编码用户昵称、账号 ID 或截图内容来“修复”识别。
- 二维码、验证码、短信、实名和风控由用户完成，不绕过平台验证。

## 发布状态与防重复约束

- 用户在发布确认页明确确认内容和账号后才能进入真实提交。调试、测试或身份检查不得顺带发布文章。
- 每个目标账号单独保存任务及不可变内容快照；后续文章编辑不能改变历史记录。
- 保留文章 revision 检查、requestId 幂等、账号稳定身份归一化及内容指纹防重。
- 点击提交前写入 submissionAttempt。提交结果不明确、已有人工发布声明或可能已提交时，禁止自动重试。
- “检查发布结果”只查询，不触发重新提交。重启不能把中断任务自动重新发布。
- HTTP 403、登录墙、网络失败只代表无法核验，不能断言平台仍在审核，更不能因此重新发布。
- 只有允许的公开链接可访问，且唯一作者身份、标题、完整正文核验通过，才标记“已公开发布”。评论区或正文中的作者链接不能代替文章署名。
- 遇到控件不唯一、编辑器变化、登录过期、身份不符或额外声明时暂停并如实提示，不猜测成功。

## 图文平台当前能力

- 小红书图文笔记、抖音图文作品、B站图文动态采用辅助发布；不包含视频或 B站旧版专栏。
- 助手尝试上传图片和填入文案后暂停，由用户在平台窗口最终检查并提交。不能宣称已完成自动发布或公开图文核验。
- 首版支持最多 9 张 PNG/JPEG/WebP，每张最多 8MB，保存图片顺序和专用文案快照。
- 当前保守限制为小红书标题 20/正文 1000 字、抖音 30/1000、B站 100/2000；超限提示编辑，不静默裁剪。
- 等待人工平台确认的任务保留账号占用，避免后续任务或登录操作覆盖草稿。
- 手动结束此阶段只表示平台已由用户处理，不代表已公开发布。公开图文核验未完成前不能设置虚假成功状态。
- 上传期间禁用相关提交与易产生竞争的编辑；内容变化后重新确认并生成新的提交标识。

## 验证与交付

- 按改动运行相关测试；业务、状态流转、身份解析或编辑器变更通常需运行 `npm test`、`npm run typecheck`、`npm run build`。
- 重点回归：企业隔离、解析失败、模型错误、快照不变、防重复提交、重启恢复、手动发布保护、逐账号结果、身份与资格分离、图片顺序与上传竞争。
- 不把单元测试、模拟接口或构建通过写成真实账号端到端验收。真实提交验收需要用户确认的文章、图片与账号。
- UI 测试使用独立数据目录和端口；tests/seed-ui.ts 的测试环境不能写入日常 18080 工作区。
- 浏览器检查使用当前环境允许的工具；工具拒绝访问时不绕过，也不把失败的操作报告为成功。
- 仅文档修改可不启动服务或运行业务测试，但应检查路径、命令与实际代码一致。
- 交付简述具体修改、实际执行的检查及未验证环节。遇到平台限制应说明证据，不反复要求已登录用户重新登录来掩盖适配器缺陷。

## 本机 RAG（2026-11-11）

- src/lib/rag.ts：本机 Ollama、分段、哈希/模型指纹索引、余弦检索、带引用问答。rag_indexes 独立表，仅增不改旧表。配置在 config/rag；模型默认 embeddinggemma 与 qwen3:1.7b。
- src/lib/rag-writing.ts 固定单次请求的本机/在线路由，避免设置更改使检索资料意外发送在线。启用本机模式后，选题/文章/问答都只能调用环回 Ollama；失败不能云端回退。原在线配置保留。
- 企业资料页下方 RagPanel 提供本机配置、建索引、查询与片段查看。索引依赖成功解析的当前企业资料；资料/模型改变需重建。问答期间修改资料须拒绝旧答案；文章来源保留为生成时快照，编辑后需重新核对。
- 本机 Ollama 用户配置禁用 cloud；仅允许 http loopback、拒绝重定向及 cloud 型号。模型下载需要网络，资料处理不需要外部服务。
- tests/rag-real-smoke.ts 是显式运行的真实本机模型验证，所有样例及 SQLite 在临时目录，不应给日常工作区添加演示企业。npm test 中模型 HTTP 由本机模拟服务器提供，不能冒充真实模型验收。

## 人工发布确认（2026-11-12）

- tasks/confirm-publication 需要明确 confirmed:true、该平台合法公开链接，禁止处理 queued/publishing 或未完成助手命令。
- manually_confirmed 是用户自行核对的独立状态，不能冒充 published 自动核验通过。保留确认时间、链接、确认前状态与消息及原始文章快照。
- 人工确认不触发发布；重复确认幂等，禁止覆盖确认链接或重新准备任务，自动检查不能覆盖人工记录。

## 日常 Chrome 扩展连接（2026-11-12）

- 默认 browserMode 为 extension；离线时暂停并引导配对，不回退独立 Chrome。旧 isolated 模式由用户显式选择，旧会话数据保留。
- chrome-extension/ 是 MV3 扩展；设置页将文件写入 data/chrome-extension 供用户加载。用户须在 chrome://extensions 手动加载并在弹窗配对；不能声称已替用户安装。
- browser-bridge.ts 保存一次性配对码散列和扩展 token 散列；绑定 chrome-extension Origin。API browser/extension/* 独立处理扩展来源、CORS 与授权。网页常规接口仍须本机同源。
- browser_jobs 领取一次，超时或助手重启作废；回执不重放。心跳独立每15秒，不领取新任务。图片仅对正在执行且未过期的所属任务授权。
- worker 的扩展模式只发送 login/identity/prepare，不发送脚本或任意URL；当前身份必须匹配保存身份。扩展仅在现有窗口创建标签，不创建浏览器窗口，不读取日常 Chrome 登录文件或导出凭据。
- 扩展准备前保护已有文字与图片草稿；支持同源 iframe 正文，跨域或控件不明确暂停。准备阶段保留账号占用及 manualPublicationClaim，所有平台最终在平台人工提交；不冒充自动发布。
- tests/chrome-extension-smoke.mjs 是显式的真实扩展 + 虚拟HTTPS平台验证，不包含真实平台发布。测试临时浏览器不接触用户日常Chrome。

## 固定工作区与启动校验（2026-11-12）

- 当前日常数据在 `%USERPROFILE%\GEOStudio\data`（不在 OneDrive）。项目的 gitignored `local-data.json` 固定 directory 和 workspaceId；不要删除或重建这个文件。原 AppData 数据和迁移前备份保留。
- scripts/data-location.mjs 供 Store 和 launch.mjs 共用；GEO_DATA_DIR 仍允许测试使用独立临时目录。配置目录的 SQLite 不存在必须停止，不能新建空白日常库。
- Store 打开配置工作区前核对 config/workspace；API state.storage 返回目录和标识。start.ps1 校验已运行服务标识，不接受其他空工作区作为启动成功。
- 数据恢复与迁移必须先备份、逐表及记录 ID 核对；不要打印密钥，不把 local-data.json、数据库或会话提交Git。
