import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { FetchHttpAdapter, ViemWalletAdapter } from "../ports.js";
import { AgentGridClient } from "../sdk/client.js";
import type { CheckpointStore } from "../workers.js";
import { keyPrefix, planApiKeyBinding } from "./binding.js";
import { agentHome, homePaths, loadCredential, saveCredential, writePrivate } from "./home.js";
import { askHidden, chooseWallet, confirm } from "./prompt.js";
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

export interface ResolvedApiKey {
  key?: string;
  /** User chose to create a wallet before binding. Do not register over this. */
  paused?: string;
}

const resolvedKeys = new Map<string, Promise<ResolvedApiKey>>();

/** Pick the API key for this process, asking which wallet signs before a key is bound. */
export function resolveApiKey(ctx: CliContext, walletAddress: string): Promise<ResolvedApiKey> {
  const id = `${ctx.home}|${walletAddress.toLowerCase()}|${ctx.apiBaseUrl}|${ctx.env.AGENTSGOT_API_KEY ?? ""}`;
  const cached = resolvedKeys.get(id);
  if (cached) return cached;
  const pending = resolveApiKeyOnce(ctx, walletAddress);
  resolvedKeys.set(id, pending);
  return pending;
}

const NEW_WALLET_PAUSE =
  "Not bound yet. Run `agentsgot wallet create` in this terminal, then run this command again with the same AGENTSGOT_API_KEY. The saved key was left unchanged.";

async function resolveApiKeyOnce(ctx: CliContext, walletAddress: string): Promise<ResolvedApiKey> {
  const saved = loadCredential(ctx.home);
  const plan = planApiKeyBinding({
    ...(ctx.env.AGENTSGOT_API_KEY ? { envKey: ctx.env.AGENTSGOT_API_KEY } : {}),
    saved,
    walletAddress,
    apiBaseUrl: ctx.apiBaseUrl,
  });
  if (plan.prompt && plan.onAccept === "use-env") {
    const choice = await chooseWallet(plan.prompt);
    if (choice === "new") {
      process.stderr.write(`${NEW_WALLET_PAUSE}\n`);
      const kept = saved?.apiKey;
      return { ...(kept ? { key: kept } : {}), paused: NEW_WALLET_PAUSE };
    }
    const envKey = ctx.env.AGENTSGOT_API_KEY?.trim();
    if (!envKey) return { ...(plan.key ? { key: plan.key } : {}) };
    saveCredential(
      {
        apiBaseUrl: ctx.apiBaseUrl,
        address: walletAddress,
        apiKey: envKey,
        savedAt: new Date().toISOString(),
      },
      ctx.home,
    );
    process.stderr.write(
      `Bound ${keyPrefix(envKey)} to the current wallet ${walletAddress}. Rewards stay with the wallet that owns the key.\n`,
    );
    return { key: envKey };
  }
  if (!plan.prompt) return { ...(plan.key ? { key: plan.key } : {}) };
  const accepted = await confirm(plan.prompt);
  if (!accepted) {
    process.stderr.write("Kept the saved API key. This machine was not rebound.\n");
    return { ...(plan.key ? { key: plan.key } : {}) };
  }
  process.stderr.write(
    "The saved API key stays on disk until the current wallet registers successfully.\n",
  );
  return {};
}

export async function clientFor(ctx: CliContext, account: ReturnType<typeof privateKeyToAccount>) {
  const walletClient = createWalletClient({ account, transport: http(rpcUrl(ctx)) });
  const credential = (await resolveApiKey(ctx, account.address)).key;
  const client = new AgentGridClient({
    http: new FetchHttpAdapter(ctx.apiBaseUrl),
    wallet: new ViemWalletAdapter(account, walletClient as never),
    ...(credential ? { credential } : {}),
  });
  return { client, hasCredential: Boolean(credential) };
}

export function siweMessage(ctx: CliContext, address: `0x${string}`) {
  const origin = new URL(ctx.apiBaseUrl);
  return ({ nonce }: { nonce: string }) =>
    createSiweMessage({
      address,
      chainId: Number(ctx.env.AGENTSGOT_CHAIN_ID ?? 97),
      domain: origin.host,
      nonce,
      uri: origin.origin,
      version: "1",
      statement: "Sign in to agentsgot.",
    });
}

/** SIWE login + POST /agents/register; stores the one-time API key encrypted, never prints it. */
export async function loginAndRegister(
  ctx: CliContext,
  client: AgentGridClient,
  address: `0x${string}`,
): Promise<{ agentId: string }> {
  await client.authenticate(siweMessage(ctx, address));
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
