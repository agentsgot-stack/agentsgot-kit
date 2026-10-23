import type { Params } from "../params/index.js";
import {
  AcceptanceGrade,
  AllocationMode,
  ArbitrationRound,
  type Criterion,
  type RuleCheckResult,
  type TaskDraft,
  type TaskSpec,
  TaskTemplate,
  Tier,
} from "../schemas/index.js";
import { agtToWei } from "../units.js";
import { checkSpecContent } from "./spec-content.js";

export * from "./spec-content.js";

const BPS = 10_000;
const SECONDS_PER_DAY = 86_400;
/** ParamRegistry stores fees as whole AGT; we scale to 18-decimal wei for ERC-20 compatibility. */
const AGT_UNIT = 10n ** 18n;
const tierRank = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 } as const;
const tiers = [Tier.T1, Tier.T2, Tier.T3, Tier.T4, Tier.T5] as const;

function parameter(params: Params, key: keyof Params): number {
  const value = params[key];
  if (value === null) throw new Error(`Parameter ${key} has no numeric value`);
  return value;
}

function nonnegative(value: bigint, name: string): bigint {
  if (value < 0n) throw new RangeError(`${name} must be nonnegative`);
  return value;
}

function bpsDown(value: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) throw new RangeError("bps must be a nonnegative integer");
  return (value * BigInt(bps)) / BigInt(BPS);
}

// ---------------------------------------------------------------------------
// Tier helpers
// ---------------------------------------------------------------------------

/** Returns the tier daily fee in 18-decimal wei (params stores whole AGT). */
export function tierDailyFee(tier: Tier, params: Params): bigint {
  return BigInt(parameter(params, `tierDailyFee.${tier}` as keyof Params)) * AGT_UNIT;
}

/** T1..T5 daily fees in wei frozen into a task at creation (TaskEscrow.taskDailyFeeWei). */
export type TaskDailyFees = Readonly<Record<Tier, bigint>>;

export function snapshotDailyFees(params: Params): TaskDailyFees {
  return Object.fromEntries(tiers.map((tier) => [tier, tierDailyFee(tier, params)])) as Record<
    Tier,
    bigint
  >;
}

/** A task's snapshot fee when known, otherwise the current parameter (only valid before creation). */
function dailyFee(tier: Tier, params: Params, fees: TaskDailyFees | undefined): bigint {
  return fees?.[tier] ?? tierDailyFee(tier, params);
}

export function tierDaysRange(tier: Tier, params: Params): { min: number; max: number } {
  return {
    min: parameter(params, `tierDaysMin.${tier}` as keyof Params),
    max: parameter(params, `tierDaysMax.${tier}` as keyof Params),
  };
}

export function tierBaseQuota(tier: Tier, params: Params): number {
  if (tierRank[tier] >= 3) return parameter(params, "tierBaseQuota.T3");
  return parameter(params, `tierBaseQuota.${tier}` as keyof Params);
}

export function tierSubmissionLimit(tier: Tier, params: Params): number {
  return tierBaseQuota(tier, params) * parameter(params, "submissionMultiplier");
}

export interface ParticipantLimits {
  min: number;
  default: number;
  warning: number;
  max: number;
}

export function participantLimits(params: Params): ParticipantLimits {
  return {
    min: parameter(params, "participantsMin"),
    default: parameter(params, "participantsDefault"),
    warning: parameter(params, "participantsWarning"),
    max: parameter(params, "participantsMax"),
  };
}

/** Resolves the publisher's cap independently of task tier. */
export function resolveParticipantLimit(value: number | null | undefined, params: Params): number {
  const limits = participantLimits(params);
  const resolved = value ?? limits.default;
  if (!Number.isInteger(resolved) || resolved < limits.min || resolved > limits.max) {
    throw new RangeError(`maxParticipants must be an integer in [${limits.min}, ${limits.max}]`);
  }
  return resolved;
}

export function reviewerCount(tier: Tier, params: Params): number {
  if (tierRank[tier] >= 3) return parameter(params, "reviewerCount.T3");
  return parameter(params, `reviewerCount.${tier}` as keyof Params);
}

// ---------------------------------------------------------------------------
// Minimum tier calculation (§3.4)
// ---------------------------------------------------------------------------

function criteriaTier(criteria: readonly Criterion[]): Tier {
  const cCount = criteria.filter(({ grade }) => grade === AcceptanceGrade.C).length;
  const bCount = criteria.filter(({ grade }) => grade === AcceptanceGrade.B).length;
  const total = criteria.length;
  if (total === 0) return Tier.T1;
  const cPct = (cCount / total) * 100;
  const bPct = (bCount / total) * 100;
  if (cPct > 30) return Tier.T3;
  if (cPct > 0 || bPct > 30) return Tier.T2;
  return Tier.T1;
}

function hoursTier(hours: number): Tier {
  if (hours <= 1) return Tier.T1;
  if (hours <= 6) return Tier.T2;
  if (hours <= 72) return Tier.T3;
  if (hours <= 168) return Tier.T4;
  return Tier.T5;
}

function templateBaseline(template: TaskSpec["template"]): Tier {
  if (template === TaskTemplate.Translation || template === TaskTemplate.DataProcessing)
    return Tier.T1;
  if (template === TaskTemplate.Research) return Tier.T2;
  if (template === TaskTemplate.CodeFix) return Tier.T3;
  return Tier.T1;
}

function maxTier(...levels: Tier[]): Tier {
  return levels.reduce((highest, level) => (tierRank[level] > tierRank[highest] ? level : highest));
}

export function computeMinimumTier(
  input: Pick<TaskSpec, "criteria" | "estimatedHours" | "template">,
): Tier {
  return maxTier(
    criteriaTier(input.criteria),
    hoursTier(input.estimatedHours),
    templateBaseline(input.template),
  );
}

export function computeTierRangeMax(minimumTier: Tier, params: Params): Tier {
  const offset = parameter(params, "tierRangeOffset");
  const maxRank = Math.min(tierRank[minimumTier] + offset, 5);
  return tiers[maxRank - 1]!;
}

// ---------------------------------------------------------------------------
// Reserve & deduction (§4.1–4.3)
// ---------------------------------------------------------------------------

export function computeReserve(maxTier: Tier, runDays: number, params: Params): bigint {
  if (runDays <= 0) throw new RangeError("runDays must be positive");
  return tierDailyFee(maxTier, params) * BigInt(runDays);
}

export interface DeductionSplit {
  executor: bigint;
  tester: bigint;
  reviewer: bigint;
  platform: bigint;
  total: bigint;
}

export function computeDeduction(
  lockedTier: Tier,
  billedSeconds: bigint,
  params: Params,
  fees?: TaskDailyFees,
): bigint {
  nonnegative(billedSeconds, "billedSeconds");
  const fee = dailyFee(lockedTier, params, fees);
  return (fee * billedSeconds) / BigInt(SECONDS_PER_DAY);
}

export function computeSegmentedDeduction(
  segments: readonly { tier: Tier; seconds: bigint }[],
  params: Params,
  fees?: TaskDailyFees,
): bigint {
  let total = 0n;
  for (const seg of segments) {
    nonnegative(seg.seconds, "segment.seconds");
    total += (dailyFee(seg.tier, params, fees) * seg.seconds) / BigInt(SECONDS_PER_DAY);
  }
  return total;
}

export function splitDeduction(total: bigint, params: Params): DeductionSplit {
  nonnegative(total, "deduction total");
  const executor = bpsDown(total, parameter(params, "deductionExecBps"));
  const tester = bpsDown(total, parameter(params, "deductionTestBps"));
  const reviewer = bpsDown(total, parameter(params, "deductionRevBps"));
  const platform = total - executor - tester - reviewer;
  return { executor, tester, reviewer, platform, total };
}

// ---------------------------------------------------------------------------
// Assessment fee (§4.5)
// ---------------------------------------------------------------------------

export function computeAssessmentFee(
  acceptedIndex: number,
  currentTier: Tier,
  lockedTier: Tier,
  params: Params,
  fees?: TaskDailyFees,
): bigint {
  if (!Number.isInteger(acceptedIndex) || acceptedIndex < 1)
    throw new RangeError("acceptedIndex must be a positive integer");
  const N = tierBaseQuota(lockedTier, params);
  const baseBps = parameter(params, "assessmentFeeBaseBps");
  const fee = dailyFee(currentTier, params, fees);
  const doublings = Math.floor((acceptedIndex - 1) / N);
  return bpsDown(fee, baseBps) * BigInt(2 ** doublings);
}

// ---------------------------------------------------------------------------
// Scoring & allocation (§4.4)
// ---------------------------------------------------------------------------

export interface SubmissionScore {
  submissionIndex: number;
  perCriterion: Map<string, number>;
  total: number;
  passes: boolean;
  isJunk: boolean;
}

export function computeSubmissionScore(
  criterionScores: readonly {
    criterionId: string;
    weightBps: number;
    score: number;
    grade: AcceptanceGrade;
  }[],
  passingThreshold: number,
  params: Params,
): { total: number; passes: boolean; isJunk: boolean; rewardEligible: boolean } {
  let weighted = 0;
  let allAPass = true;
  for (const cs of criterionScores) {
    weighted += cs.weightBps * cs.score;
    if (cs.grade === AcceptanceGrade.A && cs.score < 1) allAPass = false;
  }
  const total = weighted / BPS;
  const junk = parameter(params, "junkThreshold");
  const isJunk = total < junk;
  return {
    total,
    passes: allAPass && total >= passingThreshold,
    isJunk,
    rewardEligible: allAPass && !isJunk,
  };
}

export interface AllocationResult {
  submissionIndex: number;
  weight: number;
  amount: bigint;
}

export function allocateExecutorPool(
  pool: bigint,
  scores: readonly { submissionIndex: number; score: number; passes: boolean }[],
  mode: AllocationMode,
  topK?: number,
): AllocationResult[] {
  nonnegative(pool, "pool");
  const passing = scores.filter((s) => s.passes).sort((a, b) => b.score - a.score);
  if (passing.length === 0) return [];

  let weights: { submissionIndex: number; weight: number }[];

  if (mode === AllocationMode.WinnerTakesAll) {
    const maxScore = passing[0]!.score;
    const winners = passing.filter((s) => s.score === maxScore);
    const w = 1 / winners.length;
    weights = winners.map((s) => ({ submissionIndex: s.submissionIndex, weight: w }));
  } else if (mode === AllocationMode.TopK) {
    const k = topK ?? 1;
    const selected = passing.slice(0, k);
    if (selected.length < k) {
      const w = 1 / selected.length;
      weights = selected.map((s) => ({ submissionIndex: s.submissionIndex, weight: w }));
    } else {
      const lastScore = selected[selected.length - 1]!.score;
      const beforeLast = selected.filter((s) => s.score > lastScore);
      const tied = passing.filter((s) => s.score === lastScore);
      const remainingSlots = k - beforeLast.length;
      const wBefore = 1 / k;
      const wTied = remainingSlots / (k * tied.length);
      weights = [
        ...beforeLast.map((s) => ({ submissionIndex: s.submissionIndex, weight: wBefore })),
        ...tied.map((s) => ({ submissionIndex: s.submissionIndex, weight: wTied })),
      ];
    }
  } else {
    const totalScore = passing.reduce((sum, s) => sum + s.score, 0);
    if (totalScore === 0) {
      const w = 1 / passing.length;
      weights = passing.map((s) => ({ submissionIndex: s.submissionIndex, weight: w }));
    } else {
      weights = passing.map((s) => ({
        submissionIndex: s.submissionIndex,
        weight: s.score / totalScore,
      }));
    }
  }

  let allocated = 0n;
  const results: AllocationResult[] = weights.map((w, i) => {
    const amount =
      i === weights.length - 1
        ? pool - allocated
        : (pool * BigInt(Math.round(w.weight * 1_000_000_000))) / 1_000_000_000n;
    allocated += amount;
    return { submissionIndex: w.submissionIndex, weight: w.weight, amount };
  });
  return results;
}

/**
 * V4 executor allocation. Every valid, non-junk result participates and receives a
 * score-proportional share; the final item absorbs integer division dust.
 */
export function allocateProRataExecutorPool(
  pool: bigint,
  scores: readonly { submissionIndex: number; score: number; rewardEligible: boolean }[],
): AllocationResult[] {
  nonnegative(pool, "pool");
  const eligible = scores
    .filter(({ rewardEligible }) => rewardEligible)
    .sort(
      (left, right) => right.score - left.score || left.submissionIndex - right.submissionIndex,
    );
  if (eligible.length === 0) return [];
  const scaled = eligible.map((entry) => ({
    ...entry,
    units: BigInt(Math.max(1, Math.round(entry.score * 1_000_000))),
  }));
  const participantCount = BigInt(scaled.length);
  if (pool < participantCount) return [];
  const distributable = pool - participantCount;
  const totalUnits = scaled.reduce((sum, entry) => sum + entry.units, 0n);
  let distributed = 0n;
  return scaled.map((entry, index) => {
    const proportional =
      index === scaled.length - 1
        ? distributable - distributed
        : (distributable * entry.units) / totalUnits;
    distributed += proportional;
    return {
      submissionIndex: entry.submissionIndex,
      weight: Number(entry.units) / Number(totalUnits),
      amount: 1n + proportional,
    };
  });
}

// ---------------------------------------------------------------------------
// Reject bond (§4.6)
// ---------------------------------------------------------------------------

export function computeRejectBond(
  deductionExec: bigint,
  lockedTier: Tier,
  params: Params,
  fees?: TaskDailyFees,
): bigint {
  nonnegative(deductionExec, "deductionExec");
  const fromExec = bpsDown(deductionExec, parameter(params, "rejectBondExecPctBps"));
  const minFee =
    (dailyFee(lockedTier, params, fees) *
      BigInt(parameter(params, "rejectBondMinFeeMultiplierBps"))) /
    BigInt(BPS);
  return fromExec > minFee ? fromExec : minFee;
}

export function computeT1ReviewBond(
  deductionExec: bigint,
  lockedTier: Tier,
  params: Params,
  fees?: TaskDailyFees,
): bigint {
  nonnegative(deductionExec, "deductionExec");
  const fromExec = bpsDown(deductionExec, parameter(params, "t1ReviewBondExecPctBps"));
  const minFee =
    (dailyFee(lockedTier, params, fees) *
      BigInt(parameter(params, "t1ReviewBondMinFeeMultiplierBps"))) /
    BigInt(BPS);
  return fromExec > minFee ? fromExec : minFee;
}

// ---------------------------------------------------------------------------
// Vesting (§4.10)
// ---------------------------------------------------------------------------

export function vestingSchedule(
  amount: bigint,
  acceptedAtSeconds: number,
  params: Params,
): { amount: bigint; releaseAtSeconds: number }[] {
  nonnegative(amount, "amount");
  if (!Number.isInteger(acceptedAtSeconds) || acceptedAtSeconds < 0)
    throw new RangeError("acceptedAtSeconds must be a nonneg integer");

  const t0Bps = parameter(params, "vestingT0Bps");
  const t1Bps = parameter(params, "vestingT1Bps");
  const t0 = bpsDown(amount, t0Bps);
  const t1 = bpsDown(amount, t1Bps);
  const t2 = amount - t0 - t1;
  return [
    { amount: t0, releaseAtSeconds: acceptedAtSeconds },
    {
      amount: t1,
      releaseAtSeconds: acceptedAtSeconds + parameter(params, "vestingT1Days") * SECONDS_PER_DAY,
    },
    {
      amount: t2,
      releaseAtSeconds: acceptedAtSeconds + parameter(params, "vestingT2Days") * SECONDS_PER_DAY,
    },
  ];
}

// ---------------------------------------------------------------------------
// Daily emission (§4.7)
// ---------------------------------------------------------------------------

export interface EmissionInput {
  treasuryBalance: bigint;
  genesisBalance: bigint;
}

export interface EmissionComputation {
  lambda: number;
  dailyEmission: bigint;
  safetyCap: bigint;
}

export function computeDailyEmission(input: EmissionInput, params: Params): EmissionComputation {
  nonnegative(input.treasuryBalance, "treasuryBalance");
  nonnegative(input.genesisBalance, "genesisBalance");
  const H = parameter(params, "emissionHalfLifeDays");
  const lambda = 1 - 2 ** (-1 / H);
  const rawEmission = BigInt(Math.floor(Number(input.treasuryBalance) * lambda));
  const safetyBps = parameter(params, "emissionDailySafetyCapBps");
  const safetyCap = bpsDown(input.genesisBalance, safetyBps);
  const dailyEmission = rawEmission < safetyCap ? rawEmission : safetyCap;
  return { lambda, dailyEmission, safetyCap };
}

export interface TaskEmission {
  taskBilled: bigint;
  totalBilled: bigint;
  dailyEmission: bigint;
  rho: number;
  u: number;
  taskEmission: bigint;
  capped: boolean;
}

export function computeTaskDailyEmission(
  taskBilledToday: bigint,
  totalBilledToday: bigint,
  dailyEmission: bigint,
  taskCumulativeEmission: bigint,
  taskCumulativeDeduction: bigint,
  params: Params,
): TaskEmission {
  nonnegative(taskBilledToday, "taskBilledToday");
  nonnegative(totalBilledToday, "totalBilledToday");
  nonnegative(dailyEmission, "dailyEmission");
  nonnegative(taskCumulativeEmission, "taskCumulativeEmission");
  nonnegative(taskCumulativeDeduction, "taskCumulativeDeduction");

  const rhoBps = parameter(params, "emissionSafetyCoeffBps");
  const uBps = parameter(params, "unrecoverableCostBps");
  const rho = rhoBps / BPS;
  const u = uBps / BPS;

  if (totalBilledToday === 0n) {
    return {
      taskBilled: taskBilledToday,
      totalBilled: totalBilledToday,
      dailyEmission,
      rho,
      u,
      taskEmission: 0n,
      capped: false,
    };
  }

  const rateNumerator = dailyEmission;
  const rateDenominator = totalBilledToday;
  const rhoU = BigInt(Math.floor(rho * u * BPS));
  const maxRate = rhoU;

  let rate: bigint;
  if (rateNumerator * BigInt(BPS) <= maxRate * rateDenominator) {
    rate = rateNumerator;
  } else {
    rate = (maxRate * rateDenominator) / BigInt(BPS);
  }

  let taskEm = (rate * taskBilledToday) / rateDenominator;
  const hardCap = bpsDown(taskCumulativeDeduction, Math.floor(rho * u * BPS));
  let capped = false;
  if (taskCumulativeEmission + taskEm > hardCap) {
    taskEm = hardCap > taskCumulativeEmission ? hardCap - taskCumulativeEmission : 0n;
    capped = true;
  }

  return {
    taskBilled: taskBilledToday,
    totalBilled: totalBilledToday,
    dailyEmission,
    rho,
    u,
    taskEmission: taskEm,
    capped,
  };
}

// ---------------------------------------------------------------------------
// Escalation (§3.4)
// ---------------------------------------------------------------------------

export function computeEscalationStep(runDays: number, params: Params): number {
  const pctBps = parameter(params, "escalationStepPctBps");
  const minHours = parameter(params, "escalationStepMinHours");
  const stepHours = Math.max(minHours, (runDays * 24 * pctBps) / BPS);
  return stepHours * 3600;
}

export function computeCurrentTier(
  startTier: Tier,
  maxTier: Tier,
  publishedAtSeconds: number,
  nowSeconds: number,
  escalationStepSeconds: number,
): Tier {
  if (escalationStepSeconds <= 0) throw new RangeError("step must be positive");
  const elapsed = nowSeconds - publishedAtSeconds;
  if (elapsed < 0) return startTier;
  const steps = Math.floor(elapsed / escalationStepSeconds);
  const rank = Math.min(tierRank[startTier] + steps, tierRank[maxTier]);
  return tiers[rank - 1]!;
}

export function computeEarliestSubmitSeconds(runDays: number, params: Params): number {
  const pctBps = parameter(params, "earliestSubmitPctBps");
  const hours = (runDays * 24 * pctBps) / BPS;
  const minH = parameter(params, "earliestSubmitMinHours");
  const maxH = parameter(params, "earliestSubmitMaxHours");
  return Math.max(minH, Math.min(maxH, hours)) * 3600;
}

// ---------------------------------------------------------------------------
// Publisher stake (§5.2)
// ---------------------------------------------------------------------------

/** Amounts in wei. Mirrors PublisherStaking.reserve: base + ⌈β·(in-flight + next)⌉, and the balance must cover the reserve. */
export function checkPublisherStake(
  input: {
    actualStake: bigint;
    inFlightReserves: bigint;
    nextReserve: bigint;
  },
  params: Params,
): { required: bigint; available: bigint; ok: boolean } {
  nonnegative(input.actualStake, "actualStake");
  nonnegative(input.inFlightReserves, "inFlightReserves");
  nonnegative(input.nextReserve, "nextReserve");
  const beta = BigInt(parameter(params, "publisherExposureBps"));
  const exposure = input.inFlightReserves + input.nextReserve;
  const minStake =
    agtToWei(parameter(params, "publisherBaseStakeAgt")) +
    (exposure * beta + BigInt(BPS) - 1n) / BigInt(BPS);
  const required = minStake > input.nextReserve ? minStake : input.nextReserve;
  return { required, available: input.actualStake, ok: input.actualStake >= required };
}

// ---------------------------------------------------------------------------
// Validator stake (§5.1)
// ---------------------------------------------------------------------------

/** Median daily income in wei → requirement in wei, clamped to validatorStakeAgt.min/dynamicMax. */
export function computeValidatorStakeRequired(medianDailyIncome: bigint, params: Params): bigint {
  nonnegative(medianDailyIncome, "medianDailyIncome");
  const multiplied = bpsDown(medianDailyIncome, parameter(params, "validatorIncomeMultiplierBps"));
  const minimum = agtToWei(parameter(params, "validatorStakeAgt.min"));
  const maximum = agtToWei(parameter(params, "validatorStakeAgt.dynamicMax"));
  return multiplied < minimum ? minimum : multiplied > maximum ? maximum : multiplied;
}

// ---------------------------------------------------------------------------
// Arbitration panel (§7.1)
// ---------------------------------------------------------------------------

export function arbitrationPanel(
  eligibleArbitrators: number,
  round: ArbitrationRound,
  params: Params,
): { enabled: boolean; panelSize: 0 | 3 | 5 | 9 | 11 | 21; majority: number; minReveal: number } {
  if (!Number.isInteger(eligibleArbitrators) || eligibleArbitrators < 0)
    throw new RangeError("eligibleArbitrators must be nonnegative");
  if (eligibleArbitrators < parameter(params, "arbMinimumPoolSize")) {
    return { enabled: false, panelSize: 0, majority: 0, minReveal: 0 };
  }
  const full = eligibleArbitrators >= parameter(params, "arbFullPanelThreshold");
  const panelSize = (
    full
      ? round === ArbitrationRound.First
        ? parameter(params, "arbPanelSize.FullFirst")
        : parameter(params, "arbPanelSize.FullFinal")
      : round === ArbitrationRound.First
        ? parameter(params, "arbPanelSize.DegradedFirst")
        : parameter(params, "arbPanelSize.DegradedFinal")
  ) as 5 | 9 | 11 | 21;
  return {
    enabled: true,
    panelSize,
    majority: Math.floor(panelSize / 2) + 1,
    minReveal: Math.ceil((parameter(params, "arbMinRevealBps") * panelSize) / BPS),
  };
}

export function t1FallbackPanel(params: Params): {
  panelSize: number;
  approvalCount: number;
} {
  return {
    panelSize: parameter(params, "arbFallbackTesterCount"),
    approvalCount: parameter(params, "arbFallbackApprovalCount"),
  };
}

// ---------------------------------------------------------------------------
// Case fee & bond
// ---------------------------------------------------------------------------

/** Dispute value in wei → case fee in wei; matches ArbitrationCourt.quoteCaseFee. */
export function computeCaseFee(disputeValue: bigint, params: Params): bigint {
  const proportional = bpsDown(disputeValue, parameter(params, "caseFeeBps"));
  const minimum = agtToWei(parameter(params, "caseFeeMinAgt"));
  return proportional > minimum ? proportional : minimum;
}

/** Appeal bond in wei: caseFee × appealBondMultiplierBps / 10000; matches ArbitrationCourt.appealBondOf. */
export function computeAppealBond(caseFee: bigint, params: Params): bigint {
  nonnegative(caseFee, "caseFee");
  return bpsDown(caseFee, parameter(params, "appealBondMultiplierBps"));
}

export function computeCaseLock(
  disputeValue: bigint,
  validatorStake: bigint,
  params: Params,
): bigint {
  const proportional = bpsDown(disputeValue, parameter(params, "caseLockBps"));
  const minimum = agtToWei(parameter(params, "caseLockMinAgt"));
  const capped = bpsDown(validatorStake, parameter(params, "caseLockStakeCapBps"));
  const desired = proportional > minimum ? proportional : minimum;
  return desired < capped ? desired : capped;
}

export function splitCaseFee(
  caseFee: bigint,
  params: Params,
): { majority: bigint; winner: bigint; burn: bigint } {
  nonnegative(caseFee, "caseFee");
  const majority = bpsDown(caseFee, parameter(params, "caseFeeMajorityShareBps"));
  const winner = bpsDown(caseFee, parameter(params, "caseFeeWinnerShareBps"));
  return { majority, winner, burn: caseFee - majority - winner };
}

export function testerPairDecay(encounterCount: number, params: Params): number {
  if (!Number.isInteger(encounterCount) || encounterCount < 1)
    throw new RangeError("encounterCount must be positive");
  const position = Math.min(encounterCount, 5);
  return parameter(params, `testerPairDecayBps.${position}` as keyof Params);
}

// ---------------------------------------------------------------------------
// Anti-wash proof (§4.8)
// ---------------------------------------------------------------------------

export function antiWashCheck(params: Params): {
  unrecoverableBps: number;
  maxEmissionBps: number;
  ok: boolean;
} {
  const u = parameter(params, "unrecoverableCostBps");
  const rho = parameter(params, "emissionSafetyCoeffBps");
  const maxEmission = Math.floor((rho * u) / BPS);
  return { unrecoverableBps: u, maxEmissionBps: maxEmission, ok: maxEmission < u };
}

// ---------------------------------------------------------------------------
// Draft check (§3.2)
// ---------------------------------------------------------------------------

export function checkDraft(draft: TaskDraft, params: Params): RuleCheckResult[] {
  const results: RuleCheckResult[] = [];
  const required = [
    "title",
    "summary",
    "template",
    "deliverables",
    "criteria",
    "estimatedHours",
    "startTier",
    "maxTier",
    "runDays",
    "maxParticipants",
    "passingThreshold",
  ] as const;
  const missing = required.filter(
    (name) => draft.fields[name].value === null || draft.fields[name].confirmation !== "confirmed",
  );
  results.push({
    id: "draft.completeness",
    level: missing.length === 0 ? "ok" : "block",
    message:
      missing.length === 0
        ? "Required fields are confirmed"
        : `Unconfirmed fields: ${missing.join(", ")}`,
    fields: [...missing],
  });

  const draftCriteria = draft.fields.criteria.value;
  const criteria =
    draftCriteria?.flatMap((criterion) => (criterion.value === null ? [] : [criterion.value])) ??
    null;
  const criteriaConfirmed =
    draftCriteria?.every(
      (criterion) => criterion.value !== null && criterion.confirmation === "confirmed",
    ) ?? false;
  results.push({
    id: "criteria.confirmed",
    level: criteriaConfirmed ? "ok" : "block",
    message: criteriaConfirmed
      ? "Every criterion is confirmed"
      : "Every criterion must be present and confirmed",
    fields: ["criteria"],
  });

  results.push(
    ...checkSpecContent({
      title: draft.fields.title.value,
      summary: draft.fields.summary.value,
      deliverables: draft.fields.deliverables.value,
      constraints: draft.fields.constraints.value,
      inputs: draft.fields.inputs.value,
      criteria,
    }),
  );

  const ruleFieldsValid = (["minimumTier", "cost", "allocationMode"] as const).every(
    (name) => draft.fields[name].source === "rule" && draft.fields[name].value !== null,
  );
  results.push({
    id: "rule.sources",
    level: ruleFieldsValid ? "ok" : "block",
    message: ruleFieldsValid
      ? "Derived fields are present and rule-sourced"
      : "Derived fields must be present and rule-sourced",
    fields: ["minimumTier", "cost", "allocationMode"],
  });

  const weights = criteria?.reduce((sum, criterion) => sum + criterion.weightBps, 0) ?? 0;
  results.push({
    id: "criteria.weights",
    level: weights === 10_000 ? "ok" : "block",
    message:
      weights === 10_000
        ? "Criterion weights total 10000 bps"
        : "Criterion weights must total 10000 bps",
    fields: ["criteria"],
  });

  const idsUnique =
    criteria !== null && new Set(criteria.map(({ id }) => id)).size === criteria.length;
  results.push({
    id: "criteria.ids",
    level: idsUnique ? "ok" : "block",
    message: idsUnique ? "Criterion IDs are unique" : "Criterion IDs must be unique",
    fields: ["criteria"],
  });

  if (
    criteria !== null &&
    draft.fields.estimatedHours.value !== null &&
    draft.fields.template.value !== null &&
    draft.fields.startTier.value !== null &&
    draft.fields.maxTier.value !== null &&
    draft.fields.runDays.value !== null
  ) {
    const minimum = computeMinimumTier({
      criteria,
      estimatedHours: draft.fields.estimatedHours.value,
      template: draft.fields.template.value,
    });
    const rangeMax = computeTierRangeMax(minimum, params);

    const startTier = draft.fields.startTier.value;
    const maxTierVal = draft.fields.maxTier.value;

    const startOk =
      tierRank[startTier] >= tierRank[minimum] && tierRank[startTier] <= tierRank[rangeMax];
    results.push({
      id: "tier.start",
      level: startOk ? "ok" : "block",
      message: startOk
        ? "Start tier is within rule range"
        : `Start tier must be between ${minimum} and ${rangeMax}`,
      fields: ["startTier"],
      params: { minimum, rangeMax },
    });

    const maxOk =
      tierRank[maxTierVal] >= tierRank[startTier] && tierRank[maxTierVal] <= tierRank[rangeMax];
    results.push({
      id: "tier.max",
      level: maxOk ? "ok" : "block",
      message: maxOk
        ? "Max tier is within rule range"
        : `Max tier must be between ${startTier} and ${rangeMax}`,
      fields: ["maxTier"],
      params: { minimum: startTier, rangeMax },
    });

    const runDays = draft.fields.runDays.value;
    const startRange = tierDaysRange(startTier, params);
    const maxRange = tierDaysRange(maxTierVal, params);
    const effectiveMin = Math.max(startRange.min, maxRange.min);
    const effectiveMax = Math.min(startRange.max, maxRange.max);
    const daysOk = runDays >= effectiveMin && runDays <= effectiveMax;
    results.push({
      id: "runDays.range",
      level: daysOk ? "ok" : "block",
      message: daysOk
        ? "Run days within tier range"
        : "Run days must be within both start and max tier ranges",
      fields: ["runDays"],
      params: {
        minimum: String(effectiveMin),
        maximum: String(effectiveMax),
        startTier,
        maxTier: maxTierVal,
      },
    });

    const minimumTierOk = draft.fields.minimumTier.value === minimum;
    results.push({
      id: "tier.computed",
      level: minimumTierOk ? "ok" : "block",
      message: minimumTierOk
        ? "Recorded minimum tier matches rule"
        : "Recorded minimum tier is stale",
      fields: ["minimumTier"],
    });

    const reserve = computeReserve(maxTierVal, runDays, params);
    const expectedCost = {
      reserve: reserve.toString(),
      dailyFee: tierDailyFee(startTier, params).toString(),
    };
    const costOk = JSON.stringify(draft.fields.cost.value) === JSON.stringify(expectedCost);
    results.push({
      id: "cost.computed",
      level: costOk ? "ok" : "block",
      message: costOk ? "Recorded cost matches rule" : "Recorded cost is stale",
      fields: ["cost"],
    });

    const limits = participantLimits(params);
    const participantLimit = draft.fields.maxParticipants.value;
    const participantLimitOk =
      participantLimit !== null &&
      Number.isInteger(participantLimit) &&
      participantLimit >= limits.min &&
      participantLimit <= limits.max;
    results.push({
      id: "participants.range",
      level: participantLimitOk ? (participantLimit > limits.warning ? "warn" : "ok") : "block",
      message: participantLimitOk
        ? participantLimit > limits.warning
          ? `Participant cap ${participantLimit} may increase testing cost and latency`
          : `Participant cap ${participantLimit} is supported`
        : `Participant cap must be between ${limits.min} and ${limits.max}`,
      fields: ["maxParticipants"],
      params: {
        default: String(limits.default),
        warning: String(limits.warning),
        maximum: String(limits.max),
      },
    });
  }

  return results;
}
