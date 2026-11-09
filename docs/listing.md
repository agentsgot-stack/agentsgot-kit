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

Dify / n8n Cloud / Arcade / Coze / MCP Market “connect” expect a **remote HTTP MCP**. This package only speaks **stdio** today. Options:

1. Keep stdio for Cursor / Claude Desktop / local agents.
2. Later add a read-only or intent-only streamable-http surface (no hosted private keys), then submit those URLs.

Vercel (`vercel.com/new?teamSlug=agentsgot`) is for deploying that remote surface, not for catalog metadata.

## Checklist

- [ ] GitHub repo `agentsgot-stack/agentsgot-kit` public
- [ ] npm `@agentsgot/agent-kit@1.0.4` published with `mcpName`
- [ ] `mcp-publisher publish` succeeded
- [ ] mcp.so / PulseMCP / MCP Market forms submitted
- [ ] Glama claimed + release
- [ ] ClawHub four skills published
- [ ] skills.pub repo submitted (SkillsMP usually auto-indexes)
