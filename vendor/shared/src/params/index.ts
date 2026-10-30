import { z } from "zod";

import rawDefaults from "../../params/params.json" with { type: "json" };
import rawRanges from "../../params/ranges.json" with { type: "json" };

export type Params = typeof rawDefaults;
export type RuleParams = Params;

type Range = { fixed?: boolean; min?: number; max?: number; maxKey?: keyof Params };

const parameterRecordSchema = z.record(z.string(), z.number().finite().nullable());
const parameterKeys = Object.keys(rawDefaults) as (keyof Params)[];
const ranges = rawRanges as Record<keyof Params, Range>;

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid rule parameters: ${message}`);
}

function validateParams(candidate: unknown): Params {
  const values = parameterRecordSchema.parse(candidate) as Record<string, number | null>;
  assertInvariant(
    Object.keys(values).length === parameterKeys.length,
    "parameter key count differs from params.json",
  );
  for (const key of parameterKeys) {
    assertInvariant(Object.hasOwn(values, key), `missing ${key}`);
    const value = values[key];
    const range = ranges[key];
    if (value === undefined || range === undefined)
      throw new Error(`Invalid rule parameters: missing ${key}`);
    if (value === null) {
      assertInvariant(rawDefaults[key] === null, `${key} may not be null`);
      continue;
    }
    if (range.min !== undefined)
      assertInvariant(value >= range.min, `${key} is below ${range.min}`);
    const maximum = range.maxKey === undefined ? range.max : values[range.maxKey];
    if (maximum !== undefined && maximum !== null) {
      assertInvariant(value <= maximum, `${key} is above ${maximum}`);
    }
    if (range.fixed === true) assertInvariant(value === rawDefaults[key], `${key} is fixed`);
  }

  const get = (key: keyof Params) => {
    const value = values[key];
    if (value === null || value === undefined) throw new Error(`Expected numeric parameter ${key}`);
    return value;
  };

  assertInvariant(
    get("deductionExecBps") +
      get("deductionTestBps") +
      get("deductionRevBps") +
      get("deductionPlatBps") ===
      10_000,
    "legacy deduction shares must total 10000 bps",
  );
  assertInvariant(
    get("emissionPlatformBps") +
      get("emissionExecBps") +
      get("emissionTestBps") +
      get("emissionArbBps") ===
      10_000,
    "emission shares must total 10000 bps",
  );
  assertInvariant(
    get("vestingT0Bps") + get("vestingT1Bps") + (10_000 - get("vestingT0Bps") - get("vestingT1Bps")) ===
      10_000,
    "vesting shares must total 10000 bps",
  );
  assertInvariant(
    get("tradeTaxBurnShareBps") +
      get("tradeTaxPlatformShareBps") +
      get("tradeTaxLiquidityShareBps") ===
      10_000,
    "trade tax shares must total 10000 bps",
  );
  assertInvariant(
    get("caseFeeMajorityShareBps") + get("caseFeeWinnerShareBps") + get("caseFeePlatformShareBps") ===
      10_000,
    "case fee shares must total 10000 bps",
  );
  assertInvariant(
    get("overturnPlatformShareBps") + get("overturnRighteousShareBps") === 10_000,
    "overturn shares must total 10000 bps",
  );
  assertInvariant(
    get("testerMinStakeAgt") <= get("arbitratorMinStakeAgt") &&
      get("arbitratorMinStakeAgt") <= get("validatorStakeAgt.voluntaryMax"),
    "role thresholds must satisfy tester <= arbitrator <= voluntary maximum",
  );
  assertInvariant(
    get("testerWeightCapAgt") >= get("testerMinStakeAgt") &&
      get("arbitratorWeightCapAgt") >= get("arbitratorMinStakeAgt"),
    "weight caps must not be below their role thresholds",
  );
  assertInvariant(
    get("collusionReporterRewardBps") + get("collusionArbPoolShareBps") === 10_000,
    "collusion shares must total 10000 bps",
  );
  assertInvariant(
    get("tierDailyFee.T1") < get("tierDailyFee.T2") &&
      get("tierDailyFee.T2") < get("tierDailyFee.T3") &&
      get("tierDailyFee.T3") < get("tierDailyFee.T4") &&
      get("tierDailyFee.T4") < get("tierDailyFee.T5"),
    "tier daily fees must be strictly increasing",
  );
  for (const tier of ["T1", "T2", "T3", "T4", "T5"] as const) {
    assertInvariant(
      get(`tierDaysMin.${tier}` as keyof Params) <= get(`tierDaysMax.${tier}` as keyof Params),
      `tierDaysMin.${tier} must not exceed tierDaysMax.${tier}`,
    );
  }
  assertInvariant(
    get("passingThresholdMin") <= get("passingThresholdDefault") &&
      get("passingThresholdDefault") <= get("passingThresholdMax"),
    "passing threshold default must be within min–max range",
  );
  assertInvariant(
    get("junkThreshold") < get("passingThresholdMin"),
    "junk threshold must be below passing threshold min",
  );
  assertInvariant(
    get("participantsMin") <= get("participantsDefault") &&
      get("participantsDefault") <= get("participantsWarning") &&
      get("participantsWarning") <= get("participantsMax"),
    "participant limits must satisfy min <= default <= warning <= max",
  );
  // emissionSafetyCoeffBps / unrecoverableCostBps are deprecated in economic model v3
  // and no longer participate in §4.7 emission; retained for historical param compatibility.

  return values as Params;
}

export const defaultParams: Params = Object.freeze(validateParams(rawDefaults));

export function loadParams(overrides: Partial<Params> = {}): Params {
  return Object.freeze(validateParams({ ...rawDefaults, ...overrides }));
}
