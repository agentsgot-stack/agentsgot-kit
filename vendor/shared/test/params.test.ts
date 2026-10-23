import { describe, expect, it } from "vitest";
import paramsJson from "../params/params.json";
import { defaultParams, loadParams } from "../src/index.js";

describe("parameter source", () => {
  it("loads immutable defaults", () => {
    expect(loadParams()).toEqual(defaultParams);
    expect(Object.isFrozen(defaultParams)).toBe(true);
  });

  it("accepts an in-range override", () => {
    expect(loadParams({ "tierDailyFee.T1": 500 })["tierDailyFee.T1"]).toBe(500);
  });

  it.each([
    ["tokenTotalAgt", 999],
    ["tierDailyFee.T1", 2000],
    ["deductionExecBps", 11_000],
  ] as const)("rejects invalid override %s=%s", (key, value) => {
    expect(() => loadParams({ [key]: value })).toThrow(/Invalid rule parameters/u);
  });

  it("rejects a broken deduction split", () => {
    expect(() => loadParams({ deductionExecBps: 6000 })).toThrow(/deduction shares/u);
  });

  it("rejects a broken trade tax sum", () => {
    expect(() => loadParams({ tradeTaxBurnShareBps: 6000 })).toThrow(/trade tax shares/u);
  });

  it("rejects a broken case fee sum (fixed params are caught first)", () => {
    expect(() => loadParams({ caseFeeMajorityShareBps: 6000 })).toThrow(/Invalid rule parameters/u);
  });

  it("rejects non-increasing tier fees (range check catches first)", () => {
    expect(() =>
      loadParams({ "tierDailyFee.T1": 500, "tierDailyFee.T2": 400 }),
    ).toThrow(/Invalid rule parameters/u);
  });

  it("has all keys defined in params.json", () => {
    expect(Object.keys(defaultParams).length).toBe(Object.keys(paramsJson).length);
  });
});
