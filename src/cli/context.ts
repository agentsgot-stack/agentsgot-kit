import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { FetchHttpAdapter, ViemWalletAdapter } from "../ports.js";
import { AgentGridClient } from "../sdk/client.js";
import type { CheckpointStore } from "../workers.js";
import { agentHome, homePaths, loadCredential, saveCredential, writePrivate } from "./home.js";
import { askHidden } from "./prompt.js";
import { describeWallet, type Env, loadPrivateKey } from "./wallet.js";

export const DEFAULT_API = "https://agentsgot.network/api";

export interface CliContext {
  env: Env;
  home: string;
  apiBaseUrl: string;
}

export function cliContext(env: Env = process.env): CliContext {
  return {
    env,
    home: agentHome(env),
    apiBaseUrl: env.AGENTSGOT_API_BASE_URL ?? DEFAULT_API,
  };
}

/** Load the wallet; prompts for the keystore password on the user's own terminal if needed. */
export async function loadAccount(ctx: CliContext) {
  const source = describeWallet(ctx.env, ctx.home);
  const password =
    source?.kind === "keystore" && !ctx.env.AGENTSGOT_KEYSTORE_PASSWORD
      ? await askHidden(`Keystore password for ${source.address}: `)
      : undefined;
  return privateKeyToAccount(loadPrivateKey(ctx.env, ctx.home, password));
}

export function rpcUrl(ctx: CliContext): string | undefined {
  return ctx.env.AGENTSGOT_RPC_URL;
}

export async function clientFor(ctx: CliContext, account: ReturnType<typeof privateKeyToAccount>) {
  const walletClient = createWalletClient({ account, transport: http(rpcUrl(ctx)) });
  const stored = loadCredential(ctx.home);
  const credential =
    ctx.env.AGENTSGOT_API_KEY ??
    (stored &&
    stored.address.toLowerCase() === account.address.toLowerCase() &&
    stored.apiBaseUrl === ctx.apiBaseUrl
      ? stored.apiKey
      : undefined);
  const client = new AgentGridClient({
    http: new FetchHttpAdapter(ctx.apiBaseUrl),
    wallet: new ViemWalletAdapter(account, walletClient as never),
    ...(credential ? { credential } : {}),
  });
  return { client, hasCredential: Boolean(credential) };
}

/** SIWE login + POST /agents/register; stores the one-time API key encrypted, never prints it. */
export async function loginAndRegister(
  ctx: CliContext,
  client: AgentGridClient,
  address: `0x${string}`,
): Promise<{ agentId: string }> {
  const origin = new URL(ctx.apiBaseUrl);
  await client.authenticate(({ nonce }) =>
    createSiweMessage({
      address,
      chainId: Number(ctx.env.AGENTSGOT_CHAIN_ID ?? 97),
      domain: origin.host,
      nonce,
      uri: origin.origin,
      version: "1",
      statement: "Sign in to agentsgot.",
    }),
  );
  const registered = await client.registerAgent();
  saveCredential(
    {
      apiBaseUrl: ctx.apiBaseUrl,
      address,
      agentId: registered.agentId,
      apiKey: registered.apiKey.key,
      savedAt: new Date().toISOString(),
    },
    ctx.home,
  );
  return { agentId: registered.agentId };
}

/** Native (BNB) gas balance; AGT comes from GET /agents/me/eligibility (stake.walletAgtWei). */
export async function gasBalance(ctx: CliContext, address: `0x${string}`): Promise<bigint | null> {
  const url = rpcUrl(ctx);
  if (!url) return null;
  return createPublicClient({ transport: http(url) })
    .getBalance({ address })
    .catch(() => null);
}

/** File-backed checkpoints under ~/.agentsgot/checkpoints/<address>.json (0600). */
export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly path: string) {}
  private read(): Record<string, unknown> {
    if (!existsSync(this.path)) return {};
    return JSON.parse(readFileSync(this.path, "utf8")) as Record<string, unknown>;
  }
  async get<T>(key: string): Promise<T | null> {
    return (this.read()[key] as T | undefined) ?? null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    const all = this.read();
    all[key] = value;
    writePrivate(this.path, `${JSON.stringify(all, null, 2)}\n`);
  }
}

export function checkpointStore(ctx: CliContext, address: string): FileCheckpointStore {
  return new FileCheckpointStore(
    join(homePaths(ctx.home).checkpoints, `${address.toLowerCase()}.json`),
  );
}
