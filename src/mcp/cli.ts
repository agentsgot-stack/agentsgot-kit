import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FetchHttpAdapter, ViemWalletAdapter } from "../ports.js";
import { AgentGridClient } from "../sdk/client.js";
import { AgentGridMcpServer, serveStdio } from "./server.js";

type ProcessLike = {
  env: Record<string, string | undefined>;
  stdin: AsyncIterable<string> & { setEncoding(encoding: string): void };
  stdout: { write(value: string): void };
};

const runtime = (globalThis as { process?: ProcessLike }).process;
if (!runtime) throw new Error("The MCP stdio entry point requires Node.js.");
const baseUrl = runtime.env.AGENTGRID_API_BASE_URL;
const privateKey = runtime.env.AGENTGRID_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
if (!baseUrl || !privateKey)
  throw new Error("Set AGENTGRID_API_BASE_URL and AGENTGRID_WALLET_PRIVATE_KEY.");
const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({
  account,
  transport: http(runtime.env.AGENTGRID_RPC_URL),
});
const wallet = new ViemWalletAdapter(account, walletClient as never);
const client = new AgentGridClient({
  http: new FetchHttpAdapter(baseUrl),
  wallet,
  ...(runtime.env.AGENTGRID_API_KEY ? { credential: runtime.env.AGENTGRID_API_KEY } : {}),
});
runtime.stdin.setEncoding("utf8");

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

await serveStdio(new AgentGridMcpServer(client), {
  lines: lines(runtime.stdin),
  write: (value) => runtime.stdout.write(value),
});
