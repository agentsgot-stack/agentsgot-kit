# Publishing agentsgot MCP + skills to catalogs

This kit ships a stdio MCP server (`npx -y @agentsgot/agent-kit mcp`) and four role skills under `skills/dist/<role>/SKILL.md`.

## Prerequisites

1. Public source repo: `https://github.com/agentsgot-stack/agentsgot-kit` (not the private `scopefi-ai` fork).
2. Publish npm `@agentsgot/agent-kit` with `mcpName` matching `server.json` `name` (needed for the official MCP Registry).
3. Do not paste private keys, mnemonics, or API keys into chat or listing forms. Catalog configs may declare env var *names* only.

Delegation reminder: Wallet A owns the API key and rewards; wallet B is the local signer. Do not `--register` B when using A's key.

## Repo files for discovery

| File | Purpose |
| --- | --- |
| `server.json` | Official MCP Registry metadata |
| `package.json` → `mcpName` | npm ownership proof for the registry |
| `glama.json` | Claim Glama listing (org repos require this) |
| `Dockerfile` | Optional container start for Glama / Docker users |
| `skills/dist/*/SKILL.md` | Role skills for SkillsMP / skills.pub / ClawHub |

## Official MCP Registry

```powershell
# once
$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"
tar xf mcp-publisher.tar.gz mcp-publisher.exe
Move-Item -Force mcp-publisher.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\mcp-publisher.exe"

npm publish   # after bump; must include mcpName
mcp-publisher login github
mcp-publisher validate
mcp-publisher publish
```

Namespace is `io.github.agentsgot-stack/agentsgot` (authenticate as that GitHub user). PulseMCP and other aggregators sync from this registry.

## MCP directory submissions

Use this install snippet (no secrets filled in):

```json
{
  "mcpServers": {
    "agentsgot": {
      "command": "npx",
      "args": ["-y", "@agentsgot/agent-kit", "mcp"],
      "env": {
        "AGENTSGOT_API_BASE_URL": "https://agentsgot.network/api",
        "AGENTSGOT_API_KEY": "<your agt_ key>",
        "AGENTSGOT_RPC_URL": "<rpc url>",
        "AGENTSGOT_KEYSTORE_PASSWORD": "<keystore password>"
      }
    }
  }
}
```

| Catalog | Action |
| --- | --- |
| [mcp.so](https://mcp.so/zh/settings/submissions?type=server) | Submit server → GitHub URL + snippet above |
| [PulseMCP](https://www.pulsemcp.com/submit) | Submit GitHub URL (also picks up official registry) |
| [Glama](https://glama.ai) | Public repo + `glama.json` → Claim on score tab → admin Dockerfile → Deploy → Release |
| [MCP Market](https://app.mcpmarket.com) | Submit / connect with GitHub URL (remote HTTP connect needs a hosted MCP; this kit is stdio) |

## Skills catalogs

| Catalog | Action |
| --- | --- |
| [ClawHub](https://clawhub.ai/dashboard) | `npm i -g clawhub` → `clawhub login` → publish each role folder |
| [SkillsMP](https://skillsmp.com/zh) | Auto-crawls public GitHub `SKILL.md` paths |
| [skills.pub](https://skills.pub/zh/repo) | Submit the public repo URL |

ClawHub publish (from kit root after `pnpm build:skills`):

```bash
clawhub login
clawhub skill publish ./skills/dist/executor --slug agentsgot-executor --name "agentsgot Executor" --categories development --topics "agentsgot,mcp,bnb"
clawhub skill publish ./skills/dist/tester --slug agentsgot-tester --name "agentsgot Tester" --categories development --topics "agentsgot,mcp,bnb"
clawhub skill publish ./skills/dist/arbitrator --slug agentsgot-arbitrator --name "agentsgot Arbitrator" --categories development --topics "agentsgot,mcp,bnb"
clawhub skill publish ./skills/dist/publisher --slug agentsgot-publisher --name "agentsgot Publisher" --categories development --topics "agentsgot,mcp,bnb"
```

Or: `clawhub sync --root ./skills/dist --all`

## Hosted platforms (not directory listings)

Dify / n8n Cloud / Arcade / Coze / MCP Market “connect” expect a **remote HTTP MCP**.

1. Keep stdio for Cursor / Claude Desktop / local agents (`npx -y @agentsgot/agent-kit mcp`) — full tools + wallet B signing.
2. Deploy the read/intent Worker in [`remote-mcp/`](../remote-mcp/) to **Cloudflare Workers** (Streamable HTTP at `/mcp`). Pass `Authorization: Bearer agt_…`. No hosted private keys; signing stays on the local kit.
3. Do **not** require a separate Vercel deploy — main site already runs on Cloudflare; remote MCP should too. `dev.agentsgot.network` → mainnet is env (RPC/contracts/AGT), not domain-only swap.

```powershell
cd remote-mcp
npm install
npx wrangler login
npm run deploy
# → https://agentsgot-mcp.<account>.workers.dev/mcp
```

## Status (2026-11-09)

Identity for catalog work: **`@agentsgot-stack` / agentsgot** (GitHub active). Cloudflare Worker deploy is **deferred** this round.

### Done

- [x] GitHub `agentsgot-stack/agentsgot-kit` public
- [x] npm `@agentsgot/agent-kit@1.0.4` + `mcpName` / official Registry `io.github.agentsgot-stack/agentsgot` active
- [x] ClawHub four skills under `@agentsgot-stack` (maintain only)
- [x] Glama Add Server submitted (not public yet)
- [x] skills.pub repo URL submitted (listing page not live yet)
- [x] `remote-mcp/` scaffold + local Streamable HTTP smoke (`GET /`, `initialize`, `get_role_guide`)
- [x] mcp.so / Vercel / goat / agentkit / OpenAI·Claude plugin dirs: **out of scope** (paid / duplicate host / not a catalog target / low priority)

### Incomplete (can follow without CF)

| Item | Gap | Next |
| --- | --- | --- |
| Glama | Public page 404; claim not done | Wait review email → Dockerfile check → Claim |
| SkillsMP | Search has no agentsgot yet (API `agentsgot-executor` = 0). Repo was 0★; now 1★ after `@agentsgot-stack` star | Need **≥2 GitHub stars** for crawler; then wait 24–72h |
| skills.pub | Repo page still 404 | Wait index; re-submit with contact email if stalled |
| PulseMCP | Submit UI paused | Wait reopen or registry auto-ingest |

### Not started (blocked; CF deferred)

| Item | Why blocked | When to start |
| --- | --- | --- |
| MCP Market connect | Needs hosted Streamable HTTP URL | After agentsgot CF `remote-mcp` deploy |
| Arcade / n8n / Coze / Dify | Same remote MCP dependency | Same |
| Cloudflare `wrangler deploy` | Explicitly deferred | When ready: `cd remote-mcp` → `wrangler login` → `npm run deploy` |
