import { defaultParams } from "#shared/params";
import type { Role } from "./roles.js";
import { roleSchedules } from "./schedules.js";

export const SKILLS_VERSION = "1.6.0";

/** Backend default `submissionLimits`; tasks report the live values in `viewer.submissionLimits`. */
export const DELIVERY_LIMITS = { maxFiles: 200, maxFileMb: 50, maxTotalMb: 50 } as const;

/** Raw template files keyed by name without extension, e.g. `executor`, `_onboarding`. */
export type SkillTemplates = Readonly<Record<string, string>>;

export interface RenderSkillOptions {
  apiOrigin?: string;
  docsOrigin?: string;
}

const p = defaultParams;

function funding(role: Role): string {
  const gas = "a little BNB for gas";
  switch (role) {
    case "executor":
      return `no stake; ${gas} (only for postResult, settlement and reward claims).`;
    case "tester":
      return `>= ${p.testerMinStakeAgt} AGT to stake plus ${gas}.`;
    case "arbitrator":
      return `>= ${p.arbitratorMinStakeAgt} AGT to stake plus ${gas}.`;
    case "publisher":
      return `${p.publisherBaseStakeAgt} AGT base stake + ${p.publisherExposureBps / 100}% of in-flight rewards, the task rewards themselves, plus ${gas}.`;
  }
}

function duration(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function scheduleTable(role: Role): string {
  const rows = roleSchedules(role).map(
    (job) =>
      `| ${job.name} | ${job.trigger === "event" ? "event" : duration(job.everySeconds)} | ${duration(job.expeditedSeconds)} | ${job.onChain ? "yes" : "no"} | ${job.description} |`,
  );
  return [
    "| Job | Every | Expedited | On-chain | What |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** Every `{{name}}` value; numbers are derived from params.json only. */
export function skillVariables(
  role: Role,
  options: RenderSkillOptions = {},
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(p))
    if (typeof value === "number" || typeof value === "string") values[key] = String(value);
  return {
    ...values,
    role,
    funding: funding(role),
    schedules: scheduleTable(role),
    vestingT0Pct: String(p.vestingT0Bps / 100),
    publisherExposurePct: String(p.publisherExposureBps / 100),
    missedCommitSlashPct: String(p.missedCommitSlashBps / 100),
    missedRevealSlashPct: String(p.missedRevealSlashBps / 100),
    arbResponseRateMinPct: String(p.arbResponseRateMinBps / 100),
    arbAcceptPollMinutes: String(Math.floor((p.arbAcceptWindowHours * 60) / 6)),
    deliveryMaxFiles: String(DELIVERY_LIMITS.maxFiles),
    deliveryMaxFileMb: String(DELIVERY_LIMITS.maxFileMb),
    deliveryMaxTotalMb: String(DELIVERY_LIMITS.maxTotalMb),
    apiOrigin: options.apiOrigin ?? "https://agentsgot.network",
    docsOrigin: options.docsOrigin ?? "https://agentsgot.gitbook.io/agentsgot-docs",
  };
}

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([\w.]+)\}\}/gu, (match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Unknown skill placeholder ${match}`);
    return value;
  });
}

/** Render one role's SKILL.md; shared partials are inlined first. */
export function renderSkill(
  templates: SkillTemplates,
  role: Role,
  options: RenderSkillOptions = {},
): string {
  const body = templates[role];
  if (body === undefined) throw new Error(`Missing skill template ${role}`);
  const values = skillVariables(role, options);
  const partial = (name: string) => {
    const text = templates[`_${name}`];
    if (text === undefined) throw new Error(`Missing skill partial _${name}`);
    return substitute(text, values);
  };
  return substitute(body, {
    ...values,
    onboarding: partial("onboarding"),
    safety: partial("safety"),
    rewards: partial("rewards"),
    reporting: partial("reporting"),
    delivery: partial("delivery"),
  });
}

/** Parse the `description:` line of the YAML frontmatter. */
export function skillDescription(markdown: string): string {
  const match = /^---\n[\s\S]*?^description:\s*(.+)$[\s\S]*?^---/mu.exec(
    markdown.replace(/\r\n/gu, "\n"),
  );
  return match?.[1]?.trim() ?? "";
}
