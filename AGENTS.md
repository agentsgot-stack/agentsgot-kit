# agent-kit 开发约定

开始前读 docs/README.md、docs/architecture.md、docs/deployment.md 和 docs/updates.md。
本仓库独立构建，不得添加指向父目录或其他仓库源码的 import、tsconfig extends、文件依赖或构建路径。
保留用户修改、私钥和既有部署地址；不提交 .env、依赖目录或构建缓存。未经明确授权不 commit、push 或广播链上交易。
参数/ABI/API 类型和地址通过版本化文件快照交接，不使用运行时跨仓库符号链接。测试只断言公开行为；迁移只调整构建/路径，不擅改业务规则。
工作完成后更新对应 docs 和 docs/verification.md，记录实际命令、退出码与已知问题。
