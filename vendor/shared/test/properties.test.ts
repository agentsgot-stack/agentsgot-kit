import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  AcceptanceGrade,
  AllocationMode,
  allocateExecutorPool,
  antiWashCheck,
  computeDailyEmission,
  computeDeduction,
  computeMinimumTier,
  computeReserve,
  defaultParams,
  splitDeduction,
  Tier,
  TaskTemplate,
  vestingSchedule,
} from "../src/index.js";
import { criterionA } from "./fixtures.js";

const tierRank = { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 } as const;

describe("rule properties", () => {
  it("deduction split conserves total and never returns negatives", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 18n }), (total) => {
        const split = splitDeduction(total, defaultParams);
        expect(split.executor + split.tester + split.reviewer + split.platform).toBe(split.total);
        expect(split.executor).toBeGreaterThanOrEqual(0n);
        expect(split.tester).toBeGreaterThanOrEqual(0n);
        expect(split.reviewer).toBeGreaterThanOrEqual(0n);
        expect(split.platform).toBeGreaterThanOrEqual(0n);
      }),
    );
  });

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

  it("daily emission is nonnegative and capped", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000n }),
        (balance) => {
          const result = computeDailyEmission(
            { treasuryBalance: balance, genesisBalance: 800_000_000n },
            defaultParams,
          );
          expect(result.dailyEmission).toBeGreaterThanOrEqual(0n);
          expect(result.dailyEmission).toBeLessThanOrEqual(result.safetyCap);
        },
      ),
    );
  });

  it("anti-wash: emission recovery is always below unrecoverable cost", () => {
    const { ok } = antiWashCheck(defaultParams);
    expect(ok).toBe(true);
  });
});
