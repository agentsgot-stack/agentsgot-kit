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
- reference/01-RULES.md、reference/02-INTERFACES.md 和 reference/03-STAKING-PENALTY-SPEC.md 为当前协议规则、接口与质押规格；部署状态以本轮 verification.md 为准。

- [本次验收结果与已知问题](verification.md)

独立边界检查：`pnpm check:independent`。

当前发布基线：2026-10-24。旧合约清单已废弃；新链上发布及联动步骤见 updates.md，尚未广播或更新服务器。
