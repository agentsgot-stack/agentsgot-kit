import type { Role } from "../roles.js";
import { RoleRunner, type TickReport } from "../runner.js";
import { effectiveInterval, mergedSchedules } from "../schedules.js";
import type { AgentGridClient } from "../sdk/client.js";
import { err, out } from "./commands.js";
import { type CliContext, checkpointStore, clientFor, loadAccount } from "./context.js";
import { formatAgt } from "./doctor.js";
import { homePaths, loadConfig } from "./home.js";
import {
  formatReport,
  parseDuration,
  postWebhook,
  readReports,
  sanitize,
  summarize,
  writeEvent,
  writeReport,
} from "./reports.js";

export interface RunOptions {
  autoSend: boolean;
  sendTriggers: boolean;
  once: boolean;
  reportInterval?: string;
  webhook?: string;
}

/** Sum vesting tranches by status, formatted as AGT. */
export async function earnings(client: AgentGridClient) {
  const totals = { CLAIMED: 0n, CLAIMABLE: 0n, LOCKED: 0n } as Record<string, bigint>;
  try {
    for (const item of (await client.listRewards()).items)
      if (item.status in totals)
        totals[item.status] = (totals[item.status] ?? 0n) + BigInt(item.amount);
  } catch {
    // Rewards are informational in reports; ignore transient failures.
  }
  return {
    claimedAgt: formatAgt(totals.CLAIMED ?? 0n),
    claimableAgt: formatAgt(totals.CLAIMABLE ?? 0n),
    lockedAgt: formatAgt(totals.LOCKED ?? 0n),
  };
}

function printTick(tick: TickReport): void {
  for (const handled of tick.handled) {
    if (handled.outcome !== "skipped")
      err(
        sanitize(
          `[${tick.asOf}] ${handled.kind} ${handled.subjectId}: ${handled.outcome} - ${handled.detail}`,
        ),
      );
    if (handled.pendingTx)
      out(
        sanitize(
          `Pending transaction for ${handled.kind} ${handled.subjectId} (review and send it yourself, or rerun with --auto-send):\n${JSON.stringify(handled.pendingTx, null, 2)}`,
        ),
      );
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `agentsgot run <roles>`: presence + next-actions loop with periodic and event reports. */
export async function runCommand(
  ctx: CliContext,
  roles: Role[],
  options: RunOptions,
): Promise<void> {
  const account = await loadAccount(ctx);
  const { client, hasCredential } = await clientFor(ctx, account);
  if (!hasCredential) throw new Error("Not registered. Run `agentsgot doctor --register` first.");
  const reportsDir = homePaths(ctx.home).reports;
  const config = loadConfig(ctx.home);
  const reportSeconds = options.reportInterval
    ? parseDuration(options.reportInterval) / 1000
    : (config.reportIntervalSeconds ?? 3600);
  const webhook = options.webhook ?? ctx.env.AGENTSGOT_REPORT_WEBHOOK;
  const schedules = mergedSchedules(roles, { reportIntervalSeconds: reportSeconds });
  const presence = schedules.find((job) => job.name === "presence");
  const poll = schedules.find((job) => job.name === "next-actions");
  const runner = new RoleRunner({
    client,
    roles,
    checkpoints: checkpointStore(ctx, account.address),
    autoSend: options.autoSend,
    sendTriggers: options.sendTriggers,
  });
  const label = roles.join("+");
  if (options.autoSend) err("Auto-send is ON: caller-paid transactions are sent from your wallet.");
  err(
    `Running ${label} as ${account.address}. Jobs: ${schedules.map((job) => job.name).join(", ")}`,
  );

  let lastHeartbeatAt: string | null = null;
  let lastPresence = 0;
  let lastReport = Date.now();
  let ticks: TickReport[] = [];
  let stopping = false;
  process.once("SIGINT", () => {
    stopping = true;
  });

  const report = async () => {
    const summary = summarize(label, ticks, {
      online: lastHeartbeatAt !== null,
      lastHeartbeatAt,
      earnings: await earnings(client),
      nextReportAt: new Date(Date.now() + reportSeconds * 1000).toISOString(),
    });
    const text = formatReport(summary);
    out(text);
    writeReport(reportsDir, summary);
    if (webhook) await postWebhook(webhook, text).catch(() => undefined);
    ticks = [];
    lastReport = Date.now();
  };

  while (!stopping) {
    let expedited = false;
    try {
      if (presence && Date.now() - lastPresence >= presence.everySeconds * 1000) {
        lastHeartbeatAt = (await client.reportPresence()).lastHeartbeatAt;
        lastPresence = Date.now();
      }
      const tick = await runner.tick();
      expedited = tick.expedited;
      ticks.push(tick);
      printTick(tick);
      for (const event of tick.events) {
        writeEvent(reportsDir, label, event);
        const line = sanitize(
          `agentsgot ${label} event: ${event.type} ${event.subjectId} - ${event.detail}`,
        );
        err(line);
        if (webhook) await postWebhook(webhook, line).catch(() => undefined);
      }
    } catch (error) {
      err(sanitize(`tick failed: ${(error as Error).message}`));
    }
    if (options.once) {
      await report();
      return;
    }
    if (Date.now() - lastReport >= reportSeconds * 1000) await report();
    await sleep((poll ? effectiveInterval(poll, expedited) : 300) * 1000);
  }
  await report();
}

/** `agentsgot report --since 24h [--role r]`. */
export function reportCommand(ctx: CliContext, since = "24h", role?: string): void {
  const rows = readReports(homePaths(ctx.home).reports, parseDuration(since), role);
  if (rows.length === 0) {
    out(`No reports in the last ${since}.`);
    return;
  }
  for (const row of rows) out(sanitize(JSON.stringify(row)));
}
