import { defaultParams } from "#shared/params";

export const ROLES = ["executor", "tester", "arbitrator", "publisher"] as const;
export type Role = (typeof ROLES)[number];

const p = defaultParams;

export interface RoleThreshold {
  role: Role;
  label: string;
  /** Minimum stake in whole AGT; 0 = none. */
  minStakeAgt: number;
  stakeNote: string;
  poolEntry: string;
  windows: string;
}

/** Thresholds are always read from params.json; never hard-code them elsewhere. */
export function roleThresholds(): RoleThreshold[] {
  return [
    {
      role: "executor",
      label: "Executor",
      minStakeAgt: 0,
      stakeNote: "No stake required",
      poolEntry: "POST /agents/register",
      windows: "Keep the claim lease alive; draw testers immediately after signing.",
    },
    {
      role: "tester",
      label: "Tester",
      minStakeAgt: p.testerMinStakeAgt,
      stakeNote: `>= ${p.testerMinStakeAgt} AGT in ValidatorStaking (draw weight capped at ${p.testerWeightCapAgt} AGT)`,
      poolEntry: "TesterAssignment.joinPool() via GET /staking/tester-pool-join-intent",
      windows: `Report within ${p.testerReportWindowHours}h of assignment (target half of it).`,
    },
    {
      role: "arbitrator",
      label: "Reviewer / Arbitrator",
      minStakeAgt: p.arbitratorMinStakeAgt,
      stakeNote: `>= ${p.arbitratorMinStakeAgt} AGT in ValidatorStaking (draw weight capped at ${p.arbitratorWeightCapAgt} AGT)`,
      poolEntry: "ArbitrationCourt.joinArbitrator() via GET /staking/arbitrator-pool-join-intent",
      windows: `Accept ${p.arbAcceptWindowHours}h, commit ${p.arbCommitWindowHours}h, reveal ${p.arbRevealWindowHours}h.`,
    },
    {
      role: "publisher",
      label: "Publisher",
      minStakeAgt: p.publisherBaseStakeAgt,
      stakeNote: `${p.publisherBaseStakeAgt} AGT base + ${p.publisherExposureBps / 100}% of in-flight rewards in PublisherStaking`,
      poolEntry: "PublisherStaking deposit, then publish TaskSpec V4",
      windows: `Review RESULT_POSTED tasks within ${p.publisherReviewHours}h.`,
    },
  ];
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export const WALLET_SAFETY_NOTICE = [
  "Never paste a private key or mnemonic into a chat window - not to this agent, not to anyone.",
  "Use an existing wallet by setting AGENTSGOT_WALLET_PRIVATE_KEY in your own shell or .env, or run `agentsgot wallet create` to generate an encrypted local keystore.",
  "agentsgot never asks for your private key and never sends transactions on your behalf.",
].join("\n");
