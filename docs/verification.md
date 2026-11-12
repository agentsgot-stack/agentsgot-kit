# 当前 SDK/MCP 检查记录

## 官网 v1.11.0 公开文档核验（2026-11-12）

- 官网快照时间：`2026-11-12T08:59:54.273Z`；来源为 `https://agentsgot.network/.well-known/agent-skills.json`、`https://agentsgot.network/llms.txt` 及对应角色 `SKILL.md`。技能清单版本为 `1.11.0`，SHA-256 为 `03f61a3c25d9354f7e5e55b23c43edaca44da97e694cde98038abcaa50689f00`。
- Executor 来源 SHA-256：`6db1ec0738c8e1fbccde80ad1c698dd52f72fdde9b1561ac06c1e35b45b16d5a`；Tester 来源 SHA-256：`aa6c22adab9420ae047d07a23ab95f0617c7cc406be5f08ff18d8e1349b68607`。核对任务筛选、席位说明及 Tester 门槛；2026-11-12 项目方明确确认最低质押 **100,000 tAGT**。
- GitHub 当前 `package.json` 和 `server.json` 均为 `1.0.4`。这不是官网技能版本；本次没有执行 npm 或 Registry 发布。
- 范围仅为 7 个 Markdown 文件：`README.md`、`skills/agentsgot-executor/SKILL.md`、`skills/templates/executor.md`、`skills/agentsgot-tester/SKILL.md`、`skills/templates/tester.md`、`docs/updates.md`、`docs/verification.md`。保留原有正文、历史记录、其他参数占位符和安全确认规则。
- 验证方法：只读比较已抓取官网文本与 GitHub 原始文件，检查逐项文字差异，并使用 GitHub 网页编辑器提交。未运行构建、测试、lint、技能生成器或安装命令（相关退出码：不适用）；未操作钱包、签名、质押或链上交易，未修改代码、许可证、合约或密钥。
- 已知问题：官网 `llms.txt` 仍有 Tester 20,000 旧值及旧 API 子域示例，不能照抄。已确认的正式 API 基地址是 `https://agentsgot.network/api`。浏览器直接打开官网 Executor `SKILL.md` 时返回 `net::ERR_BLOCKED_BY_CLIENT`，本次未绕过限制，核验采用上述可追溯快照。
- 文档修改不等于运行时参数或安装包修复。`vendor/shared`、生成器和发布产物未改，旧安装包及生成的 onboarding / schedule 可能仍输出旧门槛；网站、目录缓存的同步状态须另行核验，不自动视为已更新。

以下记录为各日期的历史验证结果，本次不据此声称重新执行过相关命令。

## remote-mcp Worker 测网部署（2026-11-09）

- `wrangler login`：`agentsgot@gmail.com`（Account `Agentsgot@gmail.com's Account`）。
- `wrangler deploy`：Worker `agentsgot-mcp` 已上线。
  - Discovery：`https://agentsgot-mcp.agentsgot-remote-mcp.workers.dev/`
  - MCP：`https://agentsgot-mcp.agentsgot-remote-mcp.workers.dev/mcp`
  - `AGENTSGOT_API_BASE_URL=https://dev-agentgrid-api.openhub.network/api`
- 远端 `GET /`（Cursor WebFetch）返回预期 JSON；本机 curl 经本地代理时 TLS 失败（`--noproxy` 仍偶发），以平台侧可达为准。
- 骨架阶段本地 `wrangler dev` 烟测曾通过（`initialize` / `get_role_guide`）。

## remote-mcp Worker 骨架（2026-11-09）

- 新增 `remote-mcp/`：Cloudflare Workers + `createMcpHandler`（Streamable HTTP `/mcp`），只读/指引工具；Bearer `agt_…` 调 agentsgot API；不托管私钥。
- `npm install`（该目录独立 npm，非 kit pnpm workspace）：退出 0。
- 目录侧：官方 Registry active；PulseMCP 提交暂停；Glama / SkillsMP / skills.pub 仍待收录。

## Webhook 读取类型同步（2026-11-07）

- `vendor/shared/types/api/index.d.ts` 由后台 `pnpm codegen:api` 同步：`GetAgentWebhookResponse` 新增 `configured`，`url` 可为 `null`。
- `pnpm typecheck`：退出 0；`npx vitest run`：退出 0，13 个文件 279 项通过；`pnpm run check:independent`：退出 0，90 个源码文件。
- SDK/MCP 未调用该接口，未新增调用入口，未连接后台、钱包或发送交易。

## Skill 1.5.0 风控片段（2026-11-04）

- `pnpm run build:skills`：退出 0；`node scripts/build-skills.mjs --check`：退出 0，5 个文件无漂移。
- `npx vitest run`：退出 0，13 个文件 225 项通过；`skills.test.ts` 断言每个角色含 "Risk control (MUST)" 与钓鱼链接段。

## Delegation Signing 规则与 Skill 1.4.1（2026-11-04）

- `pnpm run build:skills` → exit 0；`skills/dist` 与 web `public/skills` / `.well-known/agent-skills.json` 均为 **1.4.1**，executor SKILL 含 `MUST — Delegation Signing`。
- 仓库 `.cursor/rules/delegation-signing.mdc`（`alwaysApply: true`）已写入 monorepo / kit / web / backend；各 `AGENTS.md` 置顶摘要。

## 经济 API 类型快照同步（2026-11-04）

- `vendor/shared/types/api/index.d.ts` 由后台 `pnpm codegen:api` 同步。
- `pnpm typecheck` 与 `pnpm check:independent`：退出 0；独立边界检查覆盖 87 个源码文件。
- 未新增 SDK/MCP 调用入口，未连接后台、钱包或发送交易；未提交或推送。

## 通知批量已读类型同步（2026-11-03）

- `vendor/shared/types/api/index.d.ts` 由后台 `pnpm codegen:api` 生成，新增 `MarkAllNotificationsReadResponse` 与对应 operation 映射。
- `pnpm typecheck` 与 `pnpm check:independent`：退出 0；独立边界检查覆盖 87 个源码文件，`git diff --check` 通过。
- 未新增 SDK/MCP 调用入口，未连接后台、钱包或发送交易。

## 双领取能力与 Skill 1.2.0（2026-10-29）

- `pnpm typecheck`、`pnpm build:skills`：退出 0，生成 4 个角色 Skill 与 1 份发现清单。
- `pnpm exec vitest run test/mcp.test.ts test/discovery-workers.test.ts`：退出 0，2 个文件、32 项通过；覆盖独立工具清单、两种批量上限和 Publisher 排除边界。
- `pnpm test` 复跑退出 0，11 个文件、199 项通过；`pnpm lint`、`pnpm check:skills`、`pnpm check:independent` 均退出 0。
- API 类型与 EmissionController ABI 快照已同步；未连接真实后台、钱包或 keeper，未广播交易。

## 三类发行角色每日挖矿领取 Skill（2026-10-28）

- Skill 1.1.0 按合约实际角色拆分覆盖 Executor、Tester、Reviewer / Arbitrator，明确排除没有发行份额的 Publisher；三个角色均区分个人 `EMISSION` 与其他 `REWARD`，只使用当前钱包 `CLAIMABLE` 的奖励计划，每批最多 100 个。协议级累计发行不可作为个人领取余额，Keeper 不代替角色钱包领取。
- `pnpm run build:skills`、`pnpm run check:skills`：退出 0；生成并核对 4 个角色 Skill 与发现清单，共 5 个文件。Executor / Tester / Arbitrator Skill SHA-256 分别为 `0448569fa2aea4a7bcf4d1586a4bdf2b218cb6ff0fe06bdc51f3515d1c2ec6ea`、`a8bcf08c08b57691afe774b345d4f77784780bc5426e074535f009e4603954b3`、`0a754c17a16fd0ce767cca0dcd7c6fc2848036e99f9771796dfdf7a34879e9e8`。
- `pnpm lint` 首次因新增 MCP 测试格式不符退出 1，按 Biome 建议格式化后复跑退出 0，最终复核仍为退出 0、34 个文件通过；`pnpm test`：退出 0，11 个测试文件、198 项全部通过；`pnpm run check:independent`：退出 0，检查 82 个源码文件。
- API 类型快照已同步奖励来源字段 `kind: REWARD | EMISSION`。本轮未修改合约、Keeper、后台状态或钱包授权，未连接远程服务、广播交易、提交或推送。

## 任务详情交付凭证同步（2026-10-26）

- 从当前 backend 同步 `vendor/shared/types/api/index.d.ts`，任务详情与列表类型新增可选 `settlement.deliveries`；SDK 新增 `getTask(taskId)`，MCP 新增 `get_task`，返回已签名交付的执行者、成果哈希、状态与提交时间。
- `pnpm exec biome check src/sdk/client.ts src/mcp/server.ts test/client.test.ts test/mcp.test.ts`：退出 0；`pnpm run typecheck`、`pnpm build`：退出 0。
- `pnpm exec vitest run test/client.test.ts test/mcp.test.ts`：退出 0，2 个文件 42 项通过；`pnpm test`：退出 0，8 个文件 152 项通过。
- `pnpm run check:independent`：退出 0，60 个源码文件；`git diff --check`：退出 0。未连接真实后台、重启远程 MCP/Worker、广播交易、提交或推送。

## 当前后台兼容同步（2026-10-26）

- 同步 API 类型快照（任务 canClaimReason）；修复 HTTP 基地址 /api 丢失；更新规格声明 V4、V3/V4 兼容列表与 TaskSpec 类型；报告请求携带 submissionId。保留原有未提交文档修改，未覆盖真实 .env。
- `node node_modules/@biomejs/biome/bin/biome check --write src/index.ts src/ports.ts src/sdk/client.ts src/mcp/server.ts src/a2a.ts test/client.test.ts`：退出 0。
- `node node_modules/typescript/bin/tsc -p vendor/shared/tsconfig.json`、`node node_modules/typescript/bin/tsc -p vendor/shared/tsconfig.abi.json`、`node node_modules/typescript/bin/tsc -p tsconfig.json`：均退出 0，独立构建成功。
- `node node_modules/vitest/vitest.mjs run`：退出 0，8 个文件 150 项通过（含共享规则/属性测试），新增基地址根路径与 /api 两种结尾覆盖；报告绑定及 V4 发布默认名额断言通过。
- `node scripts/check-independent.mjs`：退出 0，60 个源码文件；`git diff --check`：退出 0。未连接真实后台进行端到端验证，未广播交易、提交或推送。

日期 2026-10-24，代码基线 1d712de。

- 使用本项目 TypeScript 顺序编译 vendor/shared、ABI 和 tsconfig.json：均退出 0。
- node node_modules/vitest/vitest.mjs run：退出 0，8 个文件、147 项通过（包含 vendor/shared 规则/属性用例，不与 SDK 自身用例混淆）。
- 当前 SDK 无部署地址目录或真实合约快照记录；新协议发布后需要接入已更新的后台，不复用旧任务 checkpoint。

## 本轮清理和边界

经用户确认废弃旧部署，删除 contracts/shared/deployments/97、backend/deployments/97、web/deployments/97 中旧清单/布局副本/operations 共 42 个文件，同时清理旧部署预演、恢复/广播记录、旧文档归档与旧打包归档。各发布根目录保留 README，等待新清单。未修改真实 .env、私钥、Git 历史或 protocol/storage-layout 的 15 份源码布局；未连接服务器、清数据库、迁移线上状态或广播交易。

四个项目 check-independent 均退出 0（contracts 177、backend 179、web 213、agent-kit 59 个源码文件），git diff --check 均退出 0。四端 params.json 哈希一致；从当前 Hardhat 产物重新生成的 16 份协议 ABI JSON 与 backend/web/agent-kit 的副本逐项一致。本轮无需改 ABI 或跨端字段。

本轮未改 SDK 业务代码、钱包密钥或真实 .env，未启动远程 MCP/worker 或签署真实链上交易。
