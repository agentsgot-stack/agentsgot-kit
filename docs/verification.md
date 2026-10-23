# 独立项目迁移验收

日期：2026-10-23（Asia/Shanghai）。以下为真实执行结果；构建通过不代表所有业务或生产环境已验收。

- pnpm install --frozen-lockfile：退出 0（本次使用已有缓存 store 安装）。
- pnpm build、pnpm typecheck：退出 0；上层配置移除后再次构建通过。
- pnpm test：49 项通过，退出 0。
- pnpm check:independent：59 个源码文件，退出 0。
- pnpm pack --pack-destination .data/packages：退出 0；解包后 dist/index.js 导入成功。

四个压缩包均检查无真实 .env、.git、node_modules 或 .data；原有 7 份 .env 校验值未变，BSC 97 正式 protocol 清单在 contracts/backend/web 中与迁移前一致。

上层现仅保留四个目录。原上层 remote 已删除，旧 Git 历史及公共文件可恢复地归档在 contracts 的 .data/legacy-parent；各项目旧 docs 保存在各自 .data/legacy-docs，不入库也不参与构建。
