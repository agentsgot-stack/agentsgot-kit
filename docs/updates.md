# Agent Kit 更新

1. 备份 API key、钱包配置与 worker checkpoint；不要在更新时自动重建身份。
2. 更新当前仓库源码和 pnpm-lock.yaml，pnpm install --frozen-lockfile。
3. 从对应 API/合约发布接收 vendor/shared 中的协议快照，保持 API 声明、schema、typed data 和 ABI 版本一致。
4. pnpm build、pnpm typecheck、pnpm test，再 pnpm pack --pack-destination .data/packages。
5. 更新使用方依赖包或 MCP 入口路径后重启 MCP/worker。回滚使用上一版本包与兼容的后台接口，保留旧 checkpoint。

发布 tarball 自带 vendor/shared 编译结果与声明，不需要安装一个未发布的 @agentgrid/shared 包，不引用父目录。
