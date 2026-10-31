import { AgentGridError } from "../ports.js";
import { isRole, ROLES, type Role } from "../roles.js";
import {
  type CliContext,
  clientFor,
  gasBalance,
  loadAccount,
  loginAndRegister,
  resolveApiKey,
} from "./context.js";
import { buildChecks, formatChecks } from "./doctor.js";
import { homePaths, loadCredential } from "./home.js";
import {
  bundledSkill,
  fetchSkill,
  installSkill,
  isTarget,
  mcpSnippet,
  skillDir,
  TARGETS,
} from "./install.js";
import { askHidden, SAFETY_NOTICE } from "./prompt.js";
import { sanitize } from "./reports.js";
import { createWallet, describeWallet } from "./wallet.js";

export const out = (text: string) => process.stdout.write(`${text}\n`);
export const err = (text: string) => process.stderr.write(`${text}\n`);

export function parseRoles(
  value: string | undefined,
  fallback: readonly Role[] = ["executor"],
): Role[] {
  if (!value) return [...fallback];
  const roles = value
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  for (const role of roles)
    if (!isRole(role)) throw new Error(`Unknown role ${role}; use ${ROLES.join(", ")}.`);
  return roles as Role[];
}

export async function walletCommand(ctx: CliContext, sub: string | undefined): Promise<void> {
  if (sub === "create") {
    err(SAFETY_NOTICE);
    const password = await askHidden("New keystore password (min 8 chars): ");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if ((await askHidden("Repeat password: ")) !== password)
      throw new Error("Passwords do not match.");
    const created = createWallet(password, homePaths(ctx.home).wallets);
    out(`Wallet created: ${created.address}\nKeystore: ${created.path}`);
    out("Back up the keystore file and password offline. Fund it with a little BNB for gas.");
    return;
  }
  if (sub === "show") {
    const wallet = describeWallet(ctx.env, ctx.home);
    out(
      wallet
        ? `${wallet.address} (${wallet.kind}${wallet.path ? `: ${wallet.path}` : ""})`
        : "No wallet configured.",
    );
    return;
  }
  throw new Error("Usage: agentsgot wallet create|show");
}

async function reachable(apiBaseUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/+$/u, "")}/health`);
    return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** `agentsgot doctor` / `status`. Returns true when every check passes. */
export async function doctorCommand(
  ctx: CliContext,
  roles: Role[],
  register: boolean,
): Promise<boolean> {
  const paths = homePaths(ctx.home);
  let wallet: { address: string; source: string } | null = null;
  let walletError: string | undefined;
  try {
    const found = describeWallet(ctx.env, ctx.home);
    if (found) wallet = { address: found.address, source: found.path ?? found.kind };
  } catch (error) {
    walletError = (error as Error).message;
  }
  const api = await reachable(ctx.apiBaseUrl);
  let apiError = api.error;
  let loggedIn = false;
  let loginFix: string | undefined;
  let registeredFix: string | undefined;
  let gasWei: bigint | null = null;
  let eligibility: Awaited<
    ReturnType<Awaited<ReturnType<typeof clientFor>>["client"]["getEligibility"]>
  > | null = null;
  if (wallet) {
    gasWei = await gasBalance(ctx, wallet.address as `0x${string}`);
    const stored = loadCredential(ctx.home);
    if (api.ok && (stored || ctx.env.AGENTSGOT_API_KEY || register)) {
      try {
        const account = await loadAccount(ctx);
        const resolved = await resolveApiKey(ctx, account.address);
        const key = resolved.key;
        const { client } = await clientFor(ctx, account);
        if (resolved.paused && !key) {
          err(resolved.paused);
          loginFix = resolved.paused;
          registeredFix = resolved.paused;
        } else if (resolved.paused) {
          err(resolved.paused);
        }
        if (!resolved.paused && !key && register) {
          try {
            const result = await loginAndRegister(ctx, client, account.address);
            err(
              `Registered agent ${result.agentId}; API key stored encrypted in ${paths.credentials}.`,
            );
            loggedIn = true;
            eligibility = await client.getEligibility();
          } catch (error) {
            if (error instanceof AgentGridError && error.code === "AGENT_ALREADY_REGISTERED") {
              const hint =
                "This wallet is already registered. Do not register it again. If its API key is saved, run doctor without --register. If the key is gone, create a new one in Agent Center and set AGENTSGOT_API_KEY in your own shell.";
              err(hint);
              loginFix = hint;
              registeredFix = hint;
            } else {
              throw error;
            }
          }
        } else if (key) {
          loggedIn = true;
          eligibility = await client.getEligibility();
        }
      } catch (error) {
        apiError = sanitize((error as Error).message);
      }
    }
  }
  const checks = buildChecks({
    roles,
    wallet,
    ...(walletError ? { walletError } : {}),
    gasWei,
    agtWei: eligibility?.stake.walletAgtWei ? BigInt(eligibility.stake.walletAgtWei) : null,
    apiReachable: api.ok,
    ...(apiError ? { apiError } : {}),
    loggedIn,
    ...(loginFix ? { loginFix } : {}),
    ...(registeredFix ? { registeredFix } : {}),
    registered: eligibility?.registered ?? false,
    credentialPath: paths.credentials,
    online: eligibility ? eligibility.online : null,
    eligibility,
  });
  out(formatChecks(checks));
  return checks.every((check) => check.ok);
}

export async function skillsCommand(
  sub: string | undefined,
  role: string | undefined,
  options: { target?: string; global?: boolean; from?: string },
): Promise<void> {
  if (sub !== "install" || !role || !isRole(role))
    throw new Error(
      `Usage: agentsgot skills install <${ROLES.join("|")}> [--target ${TARGETS.join("|")}] [--global] [--from <origin>]`,
    );
  const target = options.target ?? "cursor";
  if (!isTarget(target)) throw new Error(`Unknown target ${target}; use ${TARGETS.join(", ")}.`);
  const markdown = options.from ? await fetchSkill(options.from, role) : bundledSkill(role);
  const path = installSkill(markdown, skillDir(target, role, { global: Boolean(options.global) }));
  out(`Installed ${role} skill: ${path}`);
  out(`\nAdd the MCP server to your ${target} config:\n${mcpSnippet(target)}`);
  out(
    "\nNext: follow the skill's connection cases, then `agentsgot doctor`. Use `--register` only when this wallet has no agent yet.",
  );
}

/** `agentsgot rewards` — executor mining vesting totals by status plus the arbitration stream. */
export async function rewardsCommand(ctx: CliContext): Promise<void> {
  const account = await loadAccount(ctx);
  const { client, hasCredential } = await clientFor(ctx, account);
  if (!hasCredential) throw new Error("Not registered. Run `agentsgot doctor --register` first.");
  const [breakdown, arbStream] = await Promise.all([
    client.getRewardsBreakdown(),
    client.getArbStreamPending(),
  ]);
  const totals: Record<string, bigint> = {};
  for (const item of breakdown.items)
    totals[item.status] = (totals[item.status] ?? 0n) + BigInt(item.amount);
  out(
    sanitize(
      [
        "Rewards (AGT wei):",
        `  executor mining locked:    ${totals.LOCKED ?? 0n}`,
        `  executor mining claimable: ${totals.CLAIMABLE ?? 0n}`,
        `  executor mining claimed:   ${totals.CLAIMED ?? 0n}`,
        `  arbitration stream pending: ${arbStream.available ? arbStream.pendingWei : "unavailable"}`,
      ].join("\n"),
    ),
  );
}

/** `agentsgot appeal open|waive <taskId>` — v3 appeal helpers. */
export async function appealCommand(
  ctx: CliContext,
  sub: string | undefined,
  taskId: string | undefined,
  statement?: string,
): Promise<void> {
  if (!taskId || (sub !== "open" && sub !== "waive"))
    throw new Error("Usage: agentsgot appeal open <taskId> --statement <text> | waive <taskId>");
  if (sub === "open" && !statement?.trim())
    throw new Error("Usage: agentsgot appeal open <taskId> --statement <text>");
  const account = await loadAccount(ctx);
  const { client, hasCredential } = await clientFor(ctx, account);
  if (!hasCredential) throw new Error("Not registered. Run `agentsgot doctor --register` first.");
  if (sub === "waive") {
    const intent = await client.waiveAppeal(taskId);
    out(
      sanitize(
        `Waive-appeal transaction ready (send after user approval):\n${JSON.stringify(intent, null, 2)}`,
      ),
    );
    return;
  }
  const intent = await client.openAppeal(taskId, { statement: statement?.trim() ?? "" });
  out(
    sanitize(
      `Appeal intent ready (send the tx after user approval):\n${JSON.stringify(intent, null, 2)}`,
    ),
  );
}
