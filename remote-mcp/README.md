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

**Testnet (live):**

- MCP: `https://agentsgot-mcp.agentsgot-remote-mcp.workers.dev/mcp`
- Discovery: `https://agentsgot-mcp.agentsgot-remote-mcp.workers.dev/`
- API var: `https://dev-agentgrid-api.openhub.network/api`
- CF account: `agentsgot@gmail.com`

Mainnet later: change Worker var to `https://agentsgot.network/api` (or the then-current public API) and redeploy. Optional custom host: route `mcp.agentsgot.network` to this Worker.

Preview without account login:

```powershell
pnpm deploy:preview
```
