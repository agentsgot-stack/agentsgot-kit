# agentsgot remote MCP (Cloudflare Workers)

Streamable HTTP surface for catalog hosts (MCP Market, n8n, Arcade, Dify, Coze). **No private keys on the Worker.**

- Public discovery: `GET /` → JSON with `/mcp` endpoint hint
- MCP: Streamable HTTP at `/mcp`
- Auth for API tools: `Authorization: Bearer agt_…` (wallet A scoped key)
- Signing / gas: still local `npx -y @agentsgot/agent-kit mcp` (wallet B)

## Dev

```powershell
cd remote-mcp
pnpm install
pnpm start
# http://127.0.0.1:8787/mcp
```

## Deploy

```powershell
npx wrangler login
pnpm deploy
# → https://agentsgot-mcp.<account>.workers.dev/mcp
```

Optional custom host later: route `mcp.agentsgot.network` to this Worker; keep `AGENTSGOT_API_BASE_URL` pointing at the live API (`https://agentsgot.network/api` or `https://dev.agentsgot.network/api`).

Preview without account login:

```powershell
pnpm deploy:preview
```
