import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RunnerEvent, TickReport } from "../runner.js";

const SECRET_PATTERNS: RegExp[] = [
  /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/gu, // private keys, salts
  /\bagt_[A-Za-z0-9_-]{8,}/gu, // agent API keys
  /\bags_[A-Za-z0-9_-]{8,}/gu, // SIWE session tokens
  /\bBearer\s+[A-Za-z0-9._-]+/gu,
  /\b(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\b/gu, // 12+ word phrases (mnemonics)
];

/** Remove anything that looks like key material before it reaches a file, webhook or chat. */
export function sanitize(text: string): string {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[redacted]"), text);
}

export interface ReportSummary {
  role: string;
  at: string;
  online: boolean;
  lastHeartbeatAt: string | null;
  counts: { claims: number; deliveries: number; testReports: number; votes: number };
  inProgress: { item: string; deadline: string | null }[];
  waitingForUser: string[];
  earnings: { claimedAgt: string; claimableAgt: string; lockedAgt: string };
  risks: string[];
  nextReportAt: string;
}

const COUNTED: Partial<Record<RunnerEvent["type"], keyof ReportSummary["counts"]>> = {
  delivery_signed: "deliveries",
  report_submitted: "testReports",
  vote_committed: "votes",
};

/** Fold the tick reports of one period into a summary. */
export function summarize(
  role: string,
  ticks: readonly TickReport[],
  extra: Pick<ReportSummary, "online" | "lastHeartbeatAt" | "earnings" | "nextReportAt">,
): ReportSummary {
  const counts = { claims: 0, deliveries: 0, testReports: 0, votes: 0 };
  const waiting = new Set<string>();
  const progress = new Map<string, string | null>();
  const risks = new Set<string>();
  for (const tick of ticks) {
    for (const event of tick.events) {
      const key = COUNTED[event.type];
      if (key) counts[key] += 1;
      if (event.type === "deadline_warning" || event.type === "tx_failed")
        risks.add(`${event.type}: ${event.detail}`);
    }
    for (const handled of tick.handled) {
      const label = `${handled.kind} ${handled.subjectId}`;
      if (handled.kind === "CLAIM_HEARTBEAT") counts.claims = Math.max(counts.claims, 1);
      if (handled.outcome === "pending-tx") waiting.add(label);
      else if (handled.outcome !== "done") progress.set(label, null);
    }
    for (const warning of tick.warnings) risks.add(warning);
  }
  return {
    role,
    at: new Date().toISOString(),
    counts,
    inProgress: [...progress].map(([item, deadline]) => ({ item, deadline })),
    waitingForUser: [...waiting],
    risks: [...risks],
    ...extra,
  };
}

export function formatReport(summary: ReportSummary): string {
  const progress =
    summary.inProgress
      .map((entry) => `${entry.item}${entry.deadline ? ` — due ${entry.deadline}` : ""}`)
      .join("; ") || "none";
  return sanitize(
    [
      `agentsgot ${summary.role} report — ${summary.at}`,
      `Online: ${summary.online ? "yes" : "no"} (last heartbeat ${summary.lastHeartbeatAt ?? "never"})`,
      `This period: claims ${summary.counts.claims} · deliveries ${summary.counts.deliveries} · test reports ${summary.counts.testReports} · votes ${summary.counts.votes}`,
      `In progress: ${progress}`,
      `Waiting for you: ${summary.waitingForUser.join("; ") || "nothing"}`,
      `Earnings (AGT): claimed ${summary.earnings.claimedAgt} · claimable ${summary.earnings.claimableAgt} · locked ${summary.earnings.lockedAgt} (v3 vesting 60/25/15 for executors)`,
      `Risks: ${summary.risks.join("; ") || "none"}`,
      `Next report: ${summary.nextReportAt}`,
    ].join("\n"),
  );
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/gu, "");
}

/** Append to <dir>/<role>-YYYYMMDD.md and .jsonl; returns the .md path. */
export function writeReport(dir: string, summary: ReportSummary): string {
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `${summary.role}-${day(new Date(summary.at))}`);
  appendFileSync(`${base}.md`, `${formatReport(summary)}\n\n`);
  appendFileSync(`${base}.jsonl`, `${sanitize(JSON.stringify({ kind: "summary", ...summary }))}\n`);
  return `${base}.md`;
}

/** Immediate event line (drawn as tester, deadline warning, tx failed, ...). */
export function writeEvent(dir: string, role: string, event: RunnerEvent): void {
  mkdirSync(dir, { recursive: true });
  const at = new Date();
  appendFileSync(
    join(dir, `${role}-${day(at)}.jsonl`),
    `${sanitize(JSON.stringify({ kind: "event", at: at.toISOString(), ...event }))}\n`,
  );
}

/** Read summaries and events newer than `sinceMs` for `agentsgot report`. */
export function readReports(dir: string, sinceMs: number, role?: string): { at: string }[] {
  if (!existsSync(dir)) return [];
  const cutoff = Date.now() - sinceMs;
  const rows: { at: string }[] = [];
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl") && (!role || name.startsWith(`${role}-`)))
    .sort();
  for (const file of files)
    for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as { at: string };
      if (new Date(row.at).getTime() >= cutoff) rows.push(row);
    }
  return rows;
}

export async function postWebhook(url: string, text: string, fetcher = fetch): Promise<void> {
  await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: sanitize(text) }),
  });
}

/** Parse "24h", "30m", "7d", "90s" into milliseconds. */
export function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/u.exec(value.trim());
  if (!match) throw new Error(`Invalid duration ${value}; use e.g. 30m, 24h, 7d.`);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as "s" | "m" | "h" | "d"
  ];
  return Number(match[1]) * unit;
}
