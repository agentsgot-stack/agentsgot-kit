import { describe, expect, it } from "vitest";

import {
  BPS,
  HOUR,
  WAD,
  arbitrationEmitted,
  buildSchedule,
  cumulativeReleased,
  cumulativeShares,
  firstHour,
  hourShares,
  pow2Neg,
  powWad,
} from "../src/emission-schedule.js";

const B0 = 800_000_000n * WAD;
const HALF_LIFE = 913n;

function sampleSchedule(startTime = 1_700_000_000n) {
  return buildSchedule({
    startTime,
    initialBalance: B0,
    halfLifeDays: HALF_LIFE,
    platformBps: 1000n,
    execBps: 6500n,
    testBps: 1500n,
  });
}

describe("emission-schedule", () => {
  it("pow2Neg is in (0, WAD)", () => {
    const q = pow2Neg(HALF_LIFE * 24n);
    expect(q).toBeGreaterThan(0n);
    expect(q).toBeLessThan(WAD);
  });

  it("powWad(q,0)=WAD and decreases with k", () => {
    const q = pow2Neg(HALF_LIFE * 24n);
    expect(powWad(q, 0n)).toBe(WAD);
    expect(powWad(q, 1n)).toBe(q);
    expect(powWad(q, 2n)).toBeLessThan(q);
  });

  it("R(t0)=0 and R grows after activation", () => {
    const s = sampleSchedule();
    expect(cumulativeReleased(s, s.startTime)).toBe(0n);
    expect(cumulativeReleased(s, s.startTime + 1n)).toBeGreaterThan(0n);
    expect(cumulativeReleased(s, s.startTime + HOUR)).toBeGreaterThan(
      cumulativeReleased(s, s.startTime + 1n),
    );
  });

  it("activation hour is partial", () => {
    const s = sampleSchedule(1_700_000_000n + 1800n);
    const h = firstHour(s);
    const shares = hourShares(s, h);
    const fullNext = hourShares(s, h + 1n);
    expect(shares.emission).toBeGreaterThan(0n);
    expect(shares.emission).toBeLessThan(fullNext.emission);
  });

  it("telescopes: sum of hour shares equals cumulative delta", () => {
    const s = sampleSchedule();
    const from = firstHour(s);
    const to = from + 47n;
    let sum = 0n;
    let plat = 0n;
    let exec = 0n;
    let test = 0n;
    let arb = 0n;
    for (let h = from; h <= to; h++) {
      const sh = hourShares(s, h);
      sum += sh.emission;
      plat += sh.platform;
      exec += sh.exec;
      test += sh.test;
      arb += sh.arb;
    }
    const end = (to + 1n) * HOUR;
    const c = cumulativeShares(s, end);
    expect(sum).toBe(c.released);
    expect(plat).toBe(c.platform);
    expect(exec).toBe(c.exec);
    expect(test).toBe(c.test);
    expect(arb).toBe(c.arb);
    expect(plat + exec + test + arb).toBe(sum);
  });

  it("never exceeds B0 and approaches it over long horizons", () => {
    const s = sampleSchedule();
    const fiftyYears = s.startTime + 50n * 365n * 24n * HOUR;
    const r = cumulativeReleased(s, fiftyYears);
    expect(r).toBeLessThanOrEqual(B0);
    expect(r).toBeGreaterThan((B0 * 95n) / 100n);
  });

  it("arbitrationEmitted matches cumulative arb delta", () => {
    const s = sampleSchedule();
    const t1 = s.startTime + 1000n;
    const t2 = s.startTime + 10_000n;
    expect(arbitrationEmitted(s, t1, t2)).toBe(
      cumulativeShares(s, t2).arb - cumulativeShares(s, t1).arb,
    );
  });

  it("bps shares use floor and arb is remainder", () => {
    const s = sampleSchedule();
    const c = cumulativeShares(s, s.startTime + HOUR);
    expect(c.platform).toBe((c.released * 1000n) / BPS);
    expect(c.exec).toBe((c.released * 6500n) / BPS);
    expect(c.test).toBe((c.released * 1500n) / BPS);
    expect(c.arb).toBe(c.released - c.platform - c.exec - c.test);
  });
});
