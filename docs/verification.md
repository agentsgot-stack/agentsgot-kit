# 独立项目迁移验收

## 质押罚没规格共享快照同步（2026-10-24）

- `pnpm typecheck`：退出 0；`pnpm exec vitest run`：8 个文件 147 项通过（含 vendor/shared 的参数、schema、规则与属性测试）；`pnpm check:independent`：59 个源码文件通过。
- vendor/shared 的 ABI、参数与 API 类型与 root shared 一致；`types/api/index.ts` 曾残留旧版本（含 `burnTotalAgt`），已替换为最新生成内容。
- `pnpm lint` 报告 `src/mcp/server.ts` 需要格式化，该文件本次未修改。

## V4 发布参数适配（2026-10-23）

- `pnpm typecheck`、`pnpm build`：退出 0；`pnpm test`：49 项全部通过。
- SDK 发布任务固定使用 `PRO_RATA`，携带 `maxParticipants`（缺省 9）；共享 V4 schema、规则、参数、ABI 与后端/合约保持一致。
- 既有 A2A/MCP API Key 委托改动予以保留，未改写其认证流程。

日期：2026-10-23（Asia/Shanghai）。以下为真实执行结果；构建通过不代表所有业务或生产环境已验收。

- pnpm install --frozen-lockfile：退出 0（本次使用已有缓存 store 安装）。
- pnpm build、pnpm typecheck：退出 0；上层配置移除后再次构建通过。
- pnpm test：49 项通过，退出 0。
- pnpm check:independent：59 个源码文件，退出 0。
- pnpm pack --pack-destination .data/packages：退出 0；解包后 dist/index.js 导入成功。

四个压缩包均检查无真实 .env、.git、node_modules 或 .data；原有 7 份 .env 校验值未变，BSC 97 正式 protocol 清单在 contracts/backend/web 中与迁移前一致。

上层现仅保留四个目录。原上层 remote 已删除，旧 Git 历史及公共文件可恢复地归档在 contracts 的 .data/legacy-parent；各项目旧 docs 保存在各自 .data/legacy-docs，不入库也不参与构建。
