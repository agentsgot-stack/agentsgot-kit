import { describe, expect, it } from "vitest";

import {
  AcceptanceGrade,
  AllocationMode,
  ArbitrationRound,
  agtToWei,
  allocateByScore,
  allocateExecutorPool,
  antiWashCheck,
  arbitrationPanel,
  checkDraft,
  checkPublisherStake,
  checkSpecContent,
  computeAppealBond,
  computeAppealFee,
  computeArbitratorWeight,
  computeCaseFee,
  computeCaseLock,
  computeCurrentTier,
    computeDeduction,
  computeDisputeBound,
  computeEarliestSubmitSeconds,
  computeEscalationStep,
  computeFinalAppealFee,
  computeArbitratorCoverage,
  computeMaxDisputeValue,
  computeMinimumTier,
  computeReserve,
  computeTaskDailyEmission,
  computeTesterMissReportSlash,
  computeTierRangeMax,
  defaultParams,
  executorPoolShare,
  formatWeiAsAgt,
  parseAgtToWei,
  qualifiedValidatorRoles,
  resolveParticipantLimit,
  snapshotDailyFees,
  splitCaseFee,
  splitEmission,
  splitOverturnPenalty,
  TaskTemplate,
  Tier,
  UNLIMITED_PARTICIPANTS,
  testerPairDecay,
  testerSeatShare,
  tierBaseQuota,
  tierDailyFee,
  tierSubmissionLimit,
  validatorDrawWeight,
  validatorRoleMinimum,
  vestingSchedule,
  vestingTranches,
} from "../src/index.js";
import { criterionA, makeDraft } from "./fixtures.js";

/** 1 AGT = 10^18 wei — the scaling factor applied by tierDailyFee. */
const AGT = 10n ** 18n;

describe("tier helpers", () => {
  it("returns daily fees in ascending order", () => {
    const fees = [Tier.T1, Tier.T2, Tier.T3, Tier.T4, Tier.T5].map((t) =>
      tierDailyFee(t, defaultParams),
    );
    for (let i = 1; i < fees.length; i++) expect(fees[i]!).toBeGreaterThan(fees[i - 1]!);
  });

  it("returns base quotas 3/5/8", () => {
    expect(tierBaseQuota(Tier.T1, defaultParams)).toBe(3);
    expect(tierBaseQuota(Tier.T2, defaultParams)).toBe(5);
    expect(tierBaseQuota(Tier.T3, defaultParams)).toBe(8);
    expect(tierBaseQuota(Tier.T4, defaultParams)).toBe(8);
    expect(tierBaseQuota(Tier.T5, defaultParams)).toBe(8);
  });

  it("returns submission limits = 3N", () => {
    expect(tierSubmissionLimit(Tier.T1, defaultParams)).toBe(9);
    expect(tierSubmissionLimit(Tier.T2, defaultParams)).toBe(15);
    expect(tierSubmissionLimit(Tier.T3, defaultParams)).toBe(24);
  });
});

describe("minimum tier and range", () => {
  it.each([
    [1, TaskTemplate.Translation, Tier.T1],
    [1, TaskTemplate.Research, Tier.T2],
    [1, TaskTemplate.CodeFix, Tier.T3],
    [6.01, TaskTemplate.Translation, Tier.T3],
    [72.01, TaskTemplate.Translation, Tier.T4],
    [169, TaskTemplate.Translation, Tier.T5],
  ] as const)("maps hours=%s template=%s to %s", (hours, template, expected) => {
    expect(
      computeMinimumTier({
        criteria: [criterionA],
        estimatedHours: hours,
        template,
      }),
    ).toBe(expected);
  });

  it("maps C-grade criteria > 30% to T3", () => {
    expect(
      computeMinimumTier({
        criteria: [
          { ...criterionA, grade: AcceptanceGrade.C, weightBps: 4_000, machineCheck: undefined },
          { ...criterionA, id: "a2", weightBps: 6_000 },
        ],
        estimatedHours: 1,
        template: TaskTemplate.Translation,
      }),
    ).toBe(Tier.T3);
  });

  it("computes range max = min(minimum + offset, 5)", () => {
    expect(computeTierRangeMax(Tier.T1, defaultParams)).toBe(Tier.T3);
    expect(computeTierRangeMax(Tier.T3, defaultParams)).toBe(Tier.T5);
    expect(computeTierRangeMax(Tier.T4, defaultParams)).toBe(Tier.T5);
    expect(computeTierRangeMax(Tier.T5, defaultParams)).toBe(Tier.T5);
  });
});

describe("reserve and deduction", () => {
  it("computes reserve = F_max × D", () => {
    expect(computeReserve(Tier.T3, 10, defaultParams)).toBe(200_000n * AGT);
  });

  it("computes deduction = F_t × seconds / 86400", () => {
    expect(computeDeduction(Tier.T1, 86400n, defaultParams)).toBe(300n * AGT);
    expect(computeDeduction(Tier.T2, 43200n, defaultParams)).toBe(1000n * AGT);
  });

});

describe("participant limit", () => {
  it("treats 0 as unlimited and accepts large custom caps", () => {
    expect(resolveParticipantLimit(UNLIMITED_PARTICIPANTS, defaultParams)).toBeNull();
    expect(resolveParticipantLimit(500, defaultParams)).toBe(500);
    expect(resolveParticipantLimit(undefined, defaultParams)).toBe(9);
    expect(() => resolveParticipantLimit(65_536, defaultParams)).toThrow(RangeError);
    expect(() => resolveParticipantLimit(1.5, defaultParams)).toThrow(RangeError);
  });
});

describe("allocation", () => {
  it("winner-takes-all gives pool to highest scorer", () => {
    const result = allocateExecutorPool(
      1000n,
      [
        { submissionIndex: 1, score: 80, passes: true },
        { submissionIndex: 2, score: 90, passes: true },
      ],
      AllocationMode.WinnerTakesAll,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.submissionIndex).toBe(2);
    expect(result[0]!.amount).toBe(1000n);
  });

  it("top-K splits equally among top K", () => {
    const result = allocateExecutorPool(
      1000n,
      [
        { submissionIndex: 1, score: 90, passes: true },
        { submissionIndex: 2, score: 80, passes: true },
        { submissionIndex: 3, score: 70, passes: true },
      ],
      AllocationMode.TopK,
      2,
    );
    expect(result).toHaveLength(2);
    const total = result.reduce((sum, r) => sum + r.amount, 0n);
    expect(total).toBe(1000n);
  });

  it("pro-rata splits by score proportion", () => {
    const result = allocateExecutorPool(
      1000n,
      [
        { submissionIndex: 1, score: 75, passes: true },
        { submissionIndex: 2, score: 25, passes: true },
      ],
      AllocationMode.ProRata,
    );
    expect(result).toHaveLength(2);
    const total = result.reduce((sum, r) => sum + r.amount, 0n);
    expect(total).toBe(1000n);
  });

  it("returns empty when no one passes", () => {
    const result = allocateExecutorPool(
      1000n,
      [{ submissionIndex: 1, score: 30, passes: false }],
      AllocationMode.WinnerTakesAll,
    );
    expect(result).toHaveLength(0);
  });
});

describe("vesting", () => {
  it("creates 3 vesting tranches at 60/25/15%", () => {
    const schedule = vestingSchedule(100n, 1_000, defaultParams);
    expect(schedule).toHaveLength(3);
    expect(schedule[0]!.amount).toBe(60n);
    expect(schedule[1]!.amount).toBe(25n);
    expect(schedule[2]!.amount).toBe(15n);
    expect(schedule.reduce((sum, t) => sum + t.amount, 0n)).toBe(100n);
  });
});

describe("emission", () => {
  it("per-task emission is capped by ρ·u·C_i", () => {
    const result = computeTaskDailyEmission(300n, 10_000n, 500n, 0n, 300n, defaultParams);
    expect(result.taskEmission).toBeGreaterThanOrEqual(0n);
  });
});

describe("escalation and timing", () => {
  it("computes escalation step = max(6h, 10%·D)", () => {
    const step = computeEscalationStep(10, defaultParams);
    expect(step).toBe(24 * 3600);
  });

  it("escalates tier from T1 towards maxTier", () => {
    const step = computeEscalationStep(3, defaultParams);
    expect(computeCurrentTier(Tier.T1, Tier.T3, 0, step + 1, step)).toBe(Tier.T2);
    expect(computeCurrentTier(Tier.T1, Tier.T3, 0, step * 3, step)).toBe(Tier.T3);
  });

  it("computes earliest submit time", () => {
    const seconds = computeEarliestSubmitSeconds(10, defaultParams);
    expect(seconds).toBe(24 * 3600);
  });
});

describe("staking", () => {
  it("uses fixed role thresholds", () => {
    expect(validatorRoleMinimum("TESTER", defaultParams)).toBe(agtToWei(20_000));
    expect(validatorRoleMinimum("ARBITRATOR", defaultParams)).toBe(agtToWei(1_000_000));
    expect(qualifiedValidatorRoles(agtToWei(19_999), defaultParams)).toEqual([]);
    expect(qualifiedValidatorRoles(agtToWei(20_000), defaultParams)).toEqual(["TESTER"]);
    expect(qualifiedValidatorRoles(agtToWei(1_000_000), defaultParams)).toEqual([
      "TESTER",
      "ARBITRATOR",
    ]);
  });

  it("caps linear draw weight per role", () => {
    expect(validatorDrawWeight(agtToWei(150_000), "TESTER", defaultParams)).toBe(agtToWei(150_000));
    expect(validatorDrawWeight(agtToWei(500_000), "TESTER", defaultParams)).toBe(agtToWei(200_000));
    expect(validatorDrawWeight(agtToWei(3_000_000), "ARBITRATOR", defaultParams)).toBe(
      agtToWei(3_000_000),
    );
  });

  it("caps the tester missed-report slash by reward multiple and stake share", () => {
    const multiple = BigInt(defaultParams.testerMissReportSlashMultiple);
    const byReward = computeTesterMissReportSlash(agtToWei(10), agtToWei(1_000_000), defaultParams);
    expect(byReward).toBe(agtToWei(10) * multiple);
    const stake = agtToWei(20_000);
    const byStake = computeTesterMissReportSlash(agtToWei(1_000_000), stake, defaultParams);
    expect(byStake).toBe((stake * BigInt(defaultParams.testerSlashStakeCapBps)) / 10_000n);
  });

  it("checks publisher stake as base wei plus rounded-up exposure", () => {
    const result = checkPublisherStake(
      { actualStake: agtToWei(30), inFlightReserves: agtToWei(55), nextReserve: agtToWei(25) },
      defaultParams,
    );
    expect(result.required).toBe(agtToWei(25));
    expect(result.ok).toBe(true);
    const small = checkPublisherStake(
      { actualStake: parseAgtToWei("0.6"), inFlightReserves: 0n, nextReserve: 1n },
      defaultParams,
    );
    expect(small.required).toBe(agtToWei(10) + 1n);
    expect(small.ok).toBe(false);
  });
});

describe("AGT units", () => {
  it("converts decimal AGT to wei without floating point drift", () => {
    expect(agtToWei(0.5)).toBe(500_000_000_000_000_000n);
    expect(agtToWei(0.1)).toBe(100_000_000_000_000_000n);
    expect(agtToWei(1e-7)).toBe(100_000_000_000n);
    expect(parseAgtToWei("0.6")).toBe(600_000_000_000_000_000n);
    expect(parseAgtToWei("12.000000000000000001")).toBe(12_000_000_000_000_000_001n);
    expect(() => parseAgtToWei("1.0000000000000000001")).toThrow(RangeError);
    expect(() => parseAgtToWei("-1")).toThrow(RangeError);
    expect(formatWeiAsAgt(600_000_000_000_000_000n)).toBe("0.6");
    expect(formatWeiAsAgt(agtToWei(2000))).toBe("2000");
  });

  it("prices disputes in wei from AGT minimums", () => {
    expect(computeCaseFee(agtToWei(100), defaultParams)).toBe(agtToWei(6));
    expect(computeCaseFee(agtToWei(1_000), defaultParams)).toBe(agtToWei(50));
    expect(computeAppealBond(agtToWei(6), defaultParams)).toBe(agtToWei(12));
    expect(computeCaseLock(agtToWei(10), agtToWei(1_000), defaultParams)).toBe(agtToWei(50));
    expect(computeCaseLock(agtToWei(10), agtToWei(100), defaultParams)).toBe(agtToWei(10));
  });

  it("uses a task's daily fee snapshot over current parameters", () => {
    const fees = { ...snapshotDailyFees(defaultParams), [Tier.T1]: agtToWei(1) };
    expect(computeDeduction(Tier.T1, 86_400n, defaultParams, fees)).toBe(agtToWei(1));
  });
});

describe("arbitration", () => {
  it.each([
    [2, ArbitrationRound.First, false, 0, 0],
    [3, ArbitrationRound.First, true, 3, 0],
    [18, ArbitrationRound.First, true, 3, 0],
    [20, ArbitrationRound.First, true, 5, 2],
    [45, ArbitrationRound.First, true, 11, 4],
    [45, ArbitrationRound.Final, true, 21, 4],
  ])("selects panel for N_arb=%s round=%s tier=%s", (count, round, enabled, panelSize, tier) => {
    expect(arbitrationPanel(count, round, defaultParams, { tier, selectable: count })).toMatchObject({
      enabled,
      panelSize,
    });
  });

  it("splits case fee 70/20/10 with the remainder to the platform", () => {
    expect(splitCaseFee(100n, defaultParams)).toEqual({ majority: 70n, winner: 20n, platform: 10n });
  });

  it("splits an overturn penalty: challenger capped by Z, rest 30% platform / 70% righteous", () => {
    const caseFee = agtToWei(6);
    const perSeat = (caseFee * 7_000n) / 10_000n / 9n;
    const challenger = perSeat * 10n;
    const split = splitOverturnPenalty(agtToWei(25), caseFee, 9, defaultParams);
    expect(split.challenger).toBe(challenger);
    expect(split.platform).toBe(((agtToWei(25) - challenger) * 3_000n) / 10_000n);
    expect(split.challenger + split.platform + split.righteous).toBe(agtToWei(25));
    expect(splitOverturnPenalty(1n, caseFee, 9, defaultParams)).toEqual({
      challenger: 1n,
      platform: 0n,
      righteous: 0n,
    });
  });

  it("publishes without a dispute cap by default and still reports seat coverage", () => {
    expect(computeDisputeBound(agtToWei(1_000), defaultParams)).toBe(agtToWei(650));
    expect(computeMaxDisputeValue({ eligibleArbitrators: 17, fullScale: false }, defaultParams)).toBe(
      (1n << 256n) - 1n,
    );
    expect(computeArbitratorCoverage({ eligibleArbitrators: 3, fullScale: false }, defaultParams)).toBe(
      agtToWei(600_000),
    );
    expect(computeArbitratorCoverage({ eligibleArbitrators: 18, fullScale: false }, defaultParams)).toBe(
      agtToWei(1_500_000),
    );
    expect(computeArbitratorCoverage({ eligibleArbitrators: 40, fullScale: true }, defaultParams)).toBe(
      agtToWei(3_300_000),
    );
  });

  it("returns tester pair decay rates", () => {
    expect(testerPairDecay(1, defaultParams)).toBe(10_000);
    expect(testerPairDecay(3, defaultParams)).toBe(4_000);
  });
});

describe("anti-wash", () => {
  it("confirms emission < unrecoverable cost", () => {
    const result = antiWashCheck(defaultParams);
    expect(result.ok).toBe(true);
    expect(result.maxEmissionBps).toBeLessThan(result.unrecoverableBps);
  });
});

describe("economic model v3", () => {
  it("splits emission into 10/65/15/10", () => {
    const amount = 800_000n * AGT;
    const split = splitEmission(amount, defaultParams);
    expect(split.platform + split.executor + split.tester + split.arbitrator).toBe(amount);
    expect(split.platform).toBe(80_000n * AGT);
    expect(split.executor).toBe(520_000n * AGT);
    expect(split.tester).toBe(120_000n * AGT);
    expect(split.arbitrator).toBe(80_000n * AGT);
  });

  it("computes appeal fee with tier cap", () => {
    expect(computeAppealFee(Tier.T1, defaultParams)).toBe(15n * AGT);
    expect(computeAppealFee(Tier.T2, defaultParams)).toBe(100n * AGT);
    expect(computeAppealFee(Tier.T3, defaultParams)).toBe(1000n * AGT);
    expect(computeAppealFee(Tier.T4, defaultParams)).toBe(2000n * AGT);
    expect(computeAppealFee(Tier.T5, defaultParams)).toBe(2000n * AGT);
    expect(computeFinalAppealFee(Tier.T1, defaultParams)).toBe(30n * AGT);
  });

  it("allocates by score with largest remainder conservation", () => {
    const pool = 1000n;
    const results = allocateByScore(pool, [
      { submissionIndex: 0, score: 60, rewardEligible: true },
      { submissionIndex: 1, score: 40, rewardEligible: true },
      { submissionIndex: 2, score: 90, rewardEligible: false },
    ]);
    expect(results.reduce((sum, row) => sum + row.amount, 0n)).toBe(pool);
    expect(results.map(({ submissionIndex }) => submissionIndex)).toEqual([0, 1]);
  });

  it("accrues executor and tester hour shares proportional to fees", () => {
    const hourExec = 650n * AGT;
    const hourTest = 150n * AGT;
    const feeA = 300n * AGT;
    const feeB = 700n * AGT;
    expect(executorPoolShare(hourExec, feeA, feeA + feeB)).toBe((hourExec * feeA) / (feeA + feeB));
    expect(testerSeatShare(hourTest, feeB, feeA + feeB)).toBe((hourTest * feeB) / (feeA + feeB));
    expect(executorPoolShare(hourExec, feeA, 0n)).toBe(0n);
  });

  it("builds vesting tranches matching 60/25/15", () => {
    const amount = 1000n * AGT;
    const t0 = 1_700_000_000;
    const tranches = vestingTranches(amount, t0, defaultParams);
    expect(tranches).toHaveLength(3);
    expect(tranches.reduce((sum, row) => sum + row.amount, 0n)).toBe(amount);
    expect(tranches[0]!.amount).toBe(600n * AGT);
    expect(tranches[1]!.amount).toBe(250n * AGT);
    expect(tranches[2]!.amount).toBe(150n * AGT);
  });

  it("computes arbitrator weight with seat bonuses", () => {
    const stake = agtToWei(1_000_000);
    const weight = computeArbitratorWeight(stake, 10_000, [{ tier: Tier.T3 }], defaultParams);
    const bonus = (agtToWei(1_000_000) * 1000n) / 10_000n;
    expect(weight).toBe(stake + bonus);
  });
});

describe("draft checks", () => {
  it("passes a valid draft", () => {
    const results = checkDraft(makeDraft(), defaultParams);
    const blockers = results.filter(({ level }) => level === "block");
    expect(blockers).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(6);
  });

  it("blocks machine checks testers cannot run", () => {
    const draft = makeDraft();
    const [criterion] = draft.fields.criteria.value ?? [];
    if (!criterion?.value) throw new Error("fixture has a criterion");
    criterion.value = {
      ...criterion.value,
      machineCheck: { kind: "COMMAND", commandOrSchema: "pnpm test", expected: "exit 0" },
    };
    const check = checkDraft(draft, defaultParams).find(
      ({ id }) => id === "criteria.machineChecks",
    );
    expect(check).toMatchObject({ level: "block", fields: ["criteria"] });
    expect(check?.params?.problems).toContain("unsupported kind COMMAND");
  });

  it("blocks placeholders", () => {
    const draft = makeDraft();
    draft.fields.inputs.value = [{ kind: "TEXT", ref: "请补充：1）交易日 2）行情数据" }];
    draft.fields.summary.value = "生成 {{date}} 的美股日报";
    const check = checkDraft(draft, defaultParams).find(({ id }) => id === "content.placeholders");
    expect(check).toMatchObject({ level: "block" });
    expect(check?.fields).toEqual(expect.arrayContaining(["inputs", "summary"]));
  });

  it("blocks invalid run days", () => {
    const draft = makeDraft();
    draft.fields.runDays.value = 100;
    const results = checkDraft(draft, defaultParams);
    const check = results.find(({ id }) => id === "runDays.range");
    expect(check?.level).toBe("block");
  });

  it("blocks stale cost", () => {
    const draft = makeDraft();
    draft.fields.cost.value = { reserve: "999999", dailyFee: "1" };
    const results = checkDraft(draft, defaultParams);
    const check = results.find(({ id }) => id === "cost.computed");
    expect(check?.level).toBe("block");
  });
});
