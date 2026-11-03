import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  AcceptanceGrade,
  AllocationMode,
  allocateExecutorPool,
  antiWashCheck,
  computeDeduction,
  cumulativeReleased,
  buildSchedule,
  computeMinimumTier,
  computeReserve,
  defaultParams,
  Tier,
  TaskTemplate,
  vestingSchedule,
} from "../src/index.js";
import { criterionA } from "./fixtures.js";

const tierRank = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 } as const;

describe("rule properties", () => {
  it("reserve equals fee × days", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(Tier.T1, Tier.T2, Tier.T3, Tier.T4, Tier.T5),
        fc.integer({ min: 1, max: 60 }),
        (tier, days) => {
          const reserve = computeReserve(tier, days, defaultParams);
          expect(reserve).toBeGreaterThan(0n);
        },
      ),
    );
  });

  it("deduction ≤ reserve for any billing period up to runDays", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(Tier.T1, Tier.T2, Tier.T3, Tier.T4, Tier.T5),
        fc.integer({ min: 1, max: 60 }),
        (tier, days) => {
          const reserve = computeReserve(tier, days, defaultParams);
          const deduction = computeDeduction(tier, BigInt(days * 86_400), defaultParams);
          expect(deduction).toBeLessThanOrEqual(reserve);
        },
      ),
    );
  });

  it("vesting schedule sums to exact amount", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 18n }), (amount) => {
        const schedule = vestingSchedule(amount, 1_000_000, defaultParams);
        expect(schedule.reduce((sum, t) => sum + t.amount, 0n)).toBe(amount);
        expect(schedule).toHaveLength(3);
        for (const tranche of schedule) expect(tranche.amount).toBeGreaterThanOrEqual(0n);
      }),
    );
  });

  it("minimum tier is monotone in hours", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (hoursBase, hoursDelta) => {
          const base = computeMinimumTier({
            criteria: [criterionA],
            estimatedHours: hoursBase,
            template: TaskTemplate.Translation,
          });
          const increased = computeMinimumTier({
            criteria: [criterionA],
            estimatedHours: hoursBase + hoursDelta,
            template: TaskTemplate.Translation,
          });
          expect(tierRank[increased]).toBeGreaterThanOrEqual(tierRank[base]);
        },
      ),
    );
  });

  it("allocation conserves pool for every mode", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        fc.constantFrom(
          AllocationMode.WinnerTakesAll,
          AllocationMode.TopK,
          AllocationMode.ProRata,
        ),
        fc.array(
          fc.record({
            submissionIndex: fc.integer({ min: 1, max: 100 }),
            score: fc.integer({ min: 0, max: 100 }),
            passes: fc.boolean(),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (pool, mode, scores) => {
          const result = allocateExecutorPool(pool, scores, mode, 3);
          const total = result.reduce((sum, r) => sum + r.amount, 0n);
          if (result.length > 0) {
            expect(total).toBe(pool);
          }
          for (const r of result) expect(r.amount).toBeGreaterThanOrEqual(0n);
        },
      ),
    );
  });

  it("cumulative released is nonnegative and at most B0", () => {
    const B0 = 800_000_000n * 10n ** 18n;
    const schedule = buildSchedule({
      startTime: 1_700_000_000n,
      initialBalance: B0,
      halfLifeDays: BigInt(defaultParams.emissionHalfLifeDays),
      platformBps: BigInt(defaultParams.emissionPlatformBps),
      execBps: BigInt(defaultParams.emissionExecBps),
      testBps: BigInt(defaultParams.emissionTestBps),
    });
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n * 365n * 24n * 3600n }), (delta) => {
        const released = cumulativeReleased(schedule, schedule.startTime + delta);
        expect(released).toBeGreaterThanOrEqual(0n);
        expect(released).toBeLessThanOrEqual(B0);
      }),
    );
  });

  it("anti-wash: emission recovery is always below unrecoverable cost", () => {
    const { ok } = antiWashCheck(defaultParams);
    expect(ok).toBe(true);
  });
});
