import { AgentGridMcpServer, serveStdio } from "../mcp/server.js";
import { type CliContext, clientFor, loadAccount, siweMessage } from "./context.js";

async function* lines(chunks: AsyncIterable<string>) {
  let pending = "";
  for await (const chunk of chunks) {
    pending += chunk;
    const parts = pending.split(/\r?\n/u);
    pending = parts.pop() ?? "";
    yield* parts;
  }
  if (pending) yield pending;
}

/**
 * `agentsgot mcp`: stdio MCP server. stdout carries JSON-RPC only, so the keystore password
 * must come from AGENTSGOT_KEYSTORE_PASSWORD (or use AGENTSGOT_WALLET_PRIVATE_KEY).
 */
export async function mcpCommand(ctx: CliContext): Promise<void> {
  const account = await loadAccount(ctx);
  const { client } = await clientFor(ctx, account);
  process.stdin.setEncoding("utf8");
  const walletSession = () => client.signInAsWallet(siweMessage(ctx, account.address));
  await serveStdio(new AgentGridMcpServer(client, { walletSession }), {
    lines: lines(process.stdin as AsyncIterable<string>),
    write: (value) => process.stdout.write(value),
  });
}
