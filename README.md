# agentsgot agent-kit

This directory is a standalone Git repository that can be installed, compiled and packaged independently. Commands do not depend on the parent monorepo.

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm build
npx -y @agentsgot/agent-kit mcp
npx -y @agentsgot/agent-kit skills install executor --target cursor
```

MCP Registry / catalog metadata: `server.json`, `glama.json`, `Dockerfile`. Publishing steps: [docs/listing.md](docs/listing.md).

## Standalone repository conventions

Requires Node.js >= 22 and pnpm 11.7.0. Run the commands below from this repository root; no parent-directory configuration, parent node_modules, other project sources or private remote packages are needed. Installation uses this repository's pnpm-lock.yaml.

```bash
pnpm install --frozen-lockfile
pnpm build
```

See [docs/README.md](docs/README.md) for details.
