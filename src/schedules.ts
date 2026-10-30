import { defaultParams } from "#shared/params";
import type { Role } from "./roles.js";

const p = defaultParams;
const HOUR = 3600;

export interface RoleSchedule {
  /** Job name used by `agentsgot run`, the skills and checkpoints. */
  name: string;
  /** "interval" jobs run every `everySeconds`; "event" jobs run as soon as a next-action appears. */
  trigger: "interval" | "event";
  everySeconds: number;
  /** Cadence while a deadline-bearing duty is in its last 20% (expedited mode): half the interval. */
  expeditedSeconds: number;
  /** Whether the job can produce a caller-paid transaction (sent only with --auto-send). */
  onChain: boolean;
  description: string;
}

export interface ScheduleRuntime {
  /** Backend runtime claimHeartbeatTimeoutSeconds (also the online window). Default 1800. */
  claimHeartbeatTimeoutSeconds?: number;
  /** Status report interval; `--report-interval`. Default 3600. */
  reportIntervalSeconds?: number;
}

/** Safety rule: never poll slower than 1/6 of the window the job protects. */
export function safeInterval(preferredSeconds: number, windowSeconds?: number): number {
  if (!windowSeconds) return preferredSeconds;
  return Math.max(30, Math.min(preferredSeconds, Math.floor(windowSeconds / 6)));
}

function job(
  name: string,
  preferredSeconds: number,
  description: string,
  options: { window?: number; onChain?: boolean; trigger?: "interval" | "event" } = {},
): RoleSchedule {
  const everySeconds = safeInterval(preferredSeconds, options.window);
  return {
    name,
    trigger: options.trigger ?? "interval",
    everySeconds,
    expeditedSeconds: Math.max(30, Math.floor(everySeconds / 2)),
    onChain: options.onChain ?? false,
    description,
  };
}

function common(runtime: ScheduleRuntime): RoleSchedule[] {
  const online = runtime.claimHeartbeatTimeoutSeconds ?? 1800;
  return [
    job("presence", 600, "POST /agents/heartbeat so the network counts the agent online.", {
      window: online,
    }),
    job("next-actions", 300, "GET /agents/me/next-actions and dispatch items by kind."),
    job(
      "status-report",
      runtime.reportIntervalSeconds ?? HOUR,
      "Write a sanitized status report (terminal, ~/.agentsgot/reports, optional webhook).",
    ),
  ];
}

function rewards(): RoleSchedule {
  return job(
    "rewards",
    6 * HOUR,
    "Check task reward schedules and daily mining allocations separately; claim each with its own endpoint in batches of up to 100.",
    { onChain: true },
  );
}

function receivesDailyEmission(role: Role): boolean {
  return role === "executor" || role === "tester" || role === "arbitrator";
}

function byRole(role: Role, runtime: ScheduleRuntime): RoleSchedule[] {
  const lease = runtime.claimHeartbeatTimeoutSeconds ?? 1800;
  switch (role) {
    case "executor":
      return [
        job(
          "scan-tasks",
          300,
          "Scan PUBLISHED/RUNNING tasks; claim only after user approval or a matching auto-claim rule.",
        ),
        job("claim-heartbeat", 300, "POST /claims/{id}/heartbeat before leaseExpiresAt.", {
          window: lease,
        }),
        job(
          "after-sign",
          60,
          "Right after the delivery is signed: commit + reveal the tester draw (no waiting).",
          { trigger: "event" },
        ),
        job(
          "progress",
          900,
          "Own tasks: build postResult once testers reported; SETTLE_TASK after the review window.",
          { onChain: true, window: p.publisherReviewHours * HOUR },
        ),
      ];
    case "tester":
      return [
        job(
          "assignments",
          120,
          "Poll for TesterAssigned and appeal-retest seats (event-driven with a webhook).",
          {
            window: p.testerReportWindowHours * HOUR,
          },
        ),
        job(
          "evaluate",
          120,
          `Evaluate immediately (including retest seats); submit by 50% of the ${p.testerReportWindowHours}h / appealRetestHours window, expedite after 80%.`,
          { trigger: "event" },
        ),
        job(
          "stake-watch",
          HOUR,
          `Stake still >= ${p.testerMinStakeAgt} AGT, still in pool, lock/cooldown state.`,
        ),
      ];
    case "arbitrator":
      return [
        job("cases", 300, "GET /arbitrator/cases.", { window: p.arbAcceptWindowHours * HOUR }),
        job(
          "confirm",
          300,
          `Report each new case to the user; confirm within ${p.arbAcceptWindowHours}h after approval.`,
          { trigger: "event", onChain: true, window: p.arbAcceptWindowHours * HOUR },
        ),
        job(
          "commit",
          HOUR,
          `Commit in the first half of the ${p.arbCommitWindowHours}h window; salt persisted locally.`,
          { trigger: "event", onChain: true, window: p.arbCommitWindowHours * HOUR },
        ),
        job(
          "reveal",
          600,
          `Reveal as soon as the ${p.arbRevealWindowHours}h window opens (early once every seat has committed); retry every 10 min (unrevealed = ${p.missedRevealSlashBps / 100}% slash).`,
          { trigger: "event", onChain: true, window: p.arbRevealWindowHours * HOUR },
        ),
        job(
          "stake-watch",
          HOUR,
          `Stake >= ${p.arbitratorMinStakeAgt} AGT, response rate >= ${p.arbResponseRateMinBps / 100}%, suspension or debt.`,
        ),
      ];
    case "publisher":
      return [
        job(
          "review",
          HOUR,
          `Remind the user to accept/reject RESULT_POSTED tasks within ${p.publisherReviewHours}h (again at 6h left).`,
          { onChain: true, window: p.publisherReviewHours * HOUR },
        ),
        job("maintenance", 24 * HOUR, "Check tasks in the maintenance period."),
      ];
  }
}

/** Jobs for one role: the common ones plus the role-specific ones. */
export function roleSchedules(role: Role, runtime: ScheduleRuntime = {}): RoleSchedule[] {
  return [
    ...common(runtime),
    ...(receivesDailyEmission(role) ? [rewards()] : []),
    ...byRole(role, runtime),
  ];
}

/** Union of schedules for several roles, de-duplicated by name (shortest interval wins). */
export function mergedSchedules(
  roles: readonly Role[],
  runtime: ScheduleRuntime = {},
): RoleSchedule[] {
  const merged = new Map<string, RoleSchedule>();
  for (const role of roles)
    for (const entry of roleSchedules(role, runtime)) {
      const existing = merged.get(entry.name);
      merged.set(
        entry.name,
        existing
          ? {
              ...existing,
              everySeconds: Math.min(existing.everySeconds, entry.everySeconds),
              expeditedSeconds: Math.min(existing.expeditedSeconds, entry.expeditedSeconds),
              onChain: existing.onChain || entry.onChain,
            }
          : entry,
      );
    }
  return [...merged.values()];
}

export type DeadlineMode = "normal" | "target-passed" | "expedited" | "overdue";

/**
 * Where `now` falls inside a [start, deadline] window: past 50% = submission target passed,
 * last 20% = expedited (poll at half interval, report immediately), past the end = overdue.
 */
export function deadlineMode(start: Date, deadline: Date, now: Date): DeadlineMode {
  const total = deadline.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  if (total <= 0 || elapsed >= total) return "overdue";
  if (elapsed >= total * 0.8) return "expedited";
  if (elapsed >= total * 0.5) return "target-passed";
  return "normal";
}

/** Interval to use for a job given whether any duty is in expedited mode. */
export function effectiveInterval(schedule: RoleSchedule, expedited: boolean): number {
  return expedited ? schedule.expeditedSeconds : schedule.everySeconds;
}
