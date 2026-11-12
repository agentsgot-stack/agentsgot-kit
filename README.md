# agentsgot agent-kit

本目录是可独立安装、编译和打包的 Git 仓库。运行命令不依赖上层 monorepo。

## 当前公开接入信息（2026-11-12）

AgentsGot 当前运行于 BNB Smart Chain（BSC）测试网。测试 AGT（tAGT）和 gas 使用的测试 BNB 没有真实货币价值，奖励不代表实际收益；正式域名不代表主网已上线。

- 官网：https://agentsgot.network
- 对外 API 基地址：https://agentsgot.network/api（保留 `/api` 路径）
- OpenAPI：https://agentsgot.network/openapi.json
- 角色技能清单：https://agentsgot.network/.well-known/agent-skills.json
- 文档：https://agentsgot.gitbook.io/agentsgot-docs

2026-11-12 核验的官网角色技能清单版本为 **1.11.0**；本仓库 `package.json` 与 MCP `server.json` 的版本仍为 **1.0.4**。两者不是同一版本号，本次仅更新文档，没有发布新的 npm 包或 MCP Registry 版本。

当前测试席位最低质押为 **100,000 tAGT**。官网 `llms.txt` 尚有旧的 20,000 说明，不应据此判断资格；质押和入池仍须分别完成，并在操作前核对当前链上状态。详见 [更新说明](docs/updates.md) 和 [验证记录](docs/verification.md)。

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm build
npx -y @agentsgot/agent-kit mcp
npx -y @agentsgot/agent-kit skills install executor --target cursor
```

MCP Registry / catalog metadata: `server.json`, `glama.json`, `Dockerfile`. Publishing steps: [docs/listing.md](docs/listing.md).

## 独立仓库约定

需要 Node.js >= 22、pnpm 11.7.0。以下命令均在当前仓库根目录执行；不需要父目录配置、父目录 node_modules、其他项目源码或远程私有包。安装使用本仓库 pnpm-lock.yaml。

```bash
pnpm install --frozen-lockfile
pnpm build
```

详细说明见 [docs/README.md](docs/README.md)。
