# 当前 SDK/MCP 检查记录

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
