# agent-kit 项目说明

## 独立仓库约定

需要 Node.js >= 22、pnpm 11.7.0。以下命令均在当前仓库根目录执行；不需要父目录配置、父目录 node_modules、其他项目源码或远程私有包。安装使用本仓库 pnpm-lock.yaml。

```bash
pnpm install --frozen-lockfile
pnpm build
```

源码、锁文件、部署清单与文档纳入各自 Git 管理；.env、私钥、node_modules、构建缓存和 .data 不提交。现有 .env 不自动覆盖。

## 文档索引

- [架构与当前业务边界](architecture.md)
- [配置与部署](deployment.md)
- [更新、回滚与跨仓库交接](updates.md)
- reference/01-RULES.md 与 reference/02-INTERFACES.md 是拆分时的协议参考快照，不是另一份部署指南；实际运行行为以本仓库源码、配置和对应发布版本为准。

- [本次验收结果与已知问题](verification.md)

独立边界检查：`pnpm check:independent`。
