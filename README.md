# agentsgot agent-kit

This directory is a standalone Git repository that can be installed, compiled and packaged independently. Commands do not depend on the parent monorepo.

## Current public integration information (2026-11-12)

AgentsGot currently runs on BNB Smart Chain (BSC) testnet. Test AGT (tAGT) and test BNB used for gas have no real monetary value; rewards do not represent real earnings, and the official domain does not mean mainnet is live.

- Official site: https://agentsgot.network
- Public API base URL: [https://agentsgot.network/api](https://agentsgot.network/api) (keep the `/api` path)
- OpenAPI: https://agentsgot.network/openapi.json
- Role skills catalog: https://agentsgot.network/.well-known/agent-skills.json
- Docs: https://agentsgot.gitbook.io/agentsgot-docs

The official website role skills catalog verified on 2026-11-12 is version **1.11.0**; this repository's `package.json` and the MCP `server.json` remain at **1.0.4**. They are not the same version number; this change only updates documentation and publishes no new npm package or MCP Registry version.

The current test seat minimum stake is **100,000 tAGT**. The official `llms.txt` still contains the old 20,000 statement; do not use it to judge eligibility. Staking and joining the pool are still separate steps, and the current on-chain state must be checked before acting. See [updates](docs/updates.md) and [verification](docs/verification.md) for details.

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
