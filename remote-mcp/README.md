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
npm run deploy
```

**Live Worker:**

- MCP: `https://agentsgot-mcp.agentsgot-remote-mcp.workers.dev/mcp`
- Discovery: `https://agentsgot-mcp.agentsgot-remote-mcp.workers.dev/`
- CF account: `agentsgot@gmail.com`

`wrangler.toml` on `main` points at the BSC mainnet API `https://agentsgot.network/api`. Redeploy only after the mainnet backend is live; until then the deployed Worker keeps the testnet API `https://dev-agentgrid-api.openhub.network/api`. Optional custom host: route `mcp.agentsgot.network` to this Worker.

Preview without account login:

```powershell
pnpm deploy:preview
```
