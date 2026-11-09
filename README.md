# agentsgot agent-kit

本目录是可独立安装、编译和打包的 Git 仓库。运行命令不依赖上层 monorepo。

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
