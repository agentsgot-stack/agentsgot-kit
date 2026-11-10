import { describe, expect, it } from "vitest";

import {
  arbitrationEmitted,
  BPS,
  buildSchedule,
  cumulativeReleased,
  cumulativeShares,
  emissionPaused,
  firstHour,
  HOUR,
  hourShares,
  pow2Neg,
  powWad,
  type Schedule,
  type ScheduleSegment,
  WAD,
  withdrawnBy,
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

describe("emission-schedule across pauses", () => {
  const start = 7_776_000n;
  const firstPause = start + 37_200n;
  const firstResume = firstPause + 18_000n;
  const secondPause = firstResume + 27_900n;
  const secondResume = secondPause + 172_800n;
  const withdrawn = 100_000_000n * WAD;

  /** Replays `pauseEmission`, `withdrawVault` and `resumeEmission` the way the contract records them. */
  function pausedTwice(): Schedule {
    const schedule: Schedule & { segments: ScheduleSegment[] } = {
      ...buildSchedule({
        startTime: start,
        initialBalance: B0,
        halfLifeDays: 912n,
        platformBps: 1000n,
        execBps: 6500n,
        testBps: 1500n,
      }),
      segments: [{ start, end: 0n, base: 0n, pool: B0 }],
    };
    const pause = (t: bigint) => {
      const last = schedule.segments.at(-1) as ScheduleSegment;
      const released = cumulativeReleased(schedule, t);
      last.end = t;
      return last.pool - (released - last.base);
    };
    const resume = (t: bigint, pool: bigint) => {
      schedule.segments.push({
        start: t,
        end: 0n,
        base: cumulativeReleased(schedule, t),
        pool,
      });
    };
    resume(firstResume, pause(firstPause) - withdrawn);
    resume(secondResume, pause(secondPause));
    return schedule;
  }

  it("matches the EmissionController vector bit for bit", () => {
    // Same scenario and values as testPausedScheduleMatchesSharedVector in EmissionController.t.sol.
    const s = pausedTwice();
    expect(cumulativeReleased(s, firstPause)).toBe(261745125786334400000000n);
    expect(cumulativeReleased(s, firstResume + 1_800n)).toBe(272824573857589555429498n);
    expect(cumulativeReleased(s, secondPause)).toBe(433458152005414719302928n);
    expect(cumulativeReleased(s, secondResume + 361_020n)).toBe(2651591916712552630764968n);
    expect(hourShares(s, firstPause / HOUR).exec).toBe(5487279239501280000000n);
    expect(hourShares(s, firstResume / HOUR).exec).toBe(9602188328421134705564n);
    expect(s.segments?.[1]?.pool).toBe(699738254874213665600000000n);
    expect(s.segments?.[2]).toEqual({
      start: secondResume,
      end: 0n,
      base: 433458152005414719302928n,
      pool: 699566541847994585280697072n,
    });
  });

  it("emits nothing while paused and leaves earlier hours untouched", () => {
    const s = pausedTwice();
    const unpaused = { ...s, segments: undefined };
    expect(cumulativeReleased(s, firstPause - 7_200n)).toBe(
      cumulativeReleased(unpaused, firstPause - 7_200n),
    );
    expect(cumulativeReleased(s, firstResume)).toBe(cumulativeReleased(s, firstPause));
    expect(hourShares(s, firstPause / HOUR + 2n).emission).toBe(0n);
    expect(arbitrationEmitted(s, secondPause, secondResume)).toBe(0n);
    expect(emissionPaused(s)).toBe(false);
    expect(emissionPaused({ ...s, segments: s.segments?.slice(0, 2) })).toBe(true);
    expect(emissionPaused(unpaused)).toBe(false);
  });

  it("never emits what governance withdrew", () => {
    const s = pausedTwice();
    const farFuture = start + 2_000n * 365n * 24n * HOUR;
    expect(cumulativeReleased(s, farFuture)).toBe(B0 - withdrawn);
  });

  it("dates a withdrawal from the pause that allowed it", () => {
    const s = pausedTwice();
    expect(withdrawnBy(s, firstPause - 1n)).toBe(0n);
    expect(withdrawnBy(s, firstPause)).toBe(withdrawn);
    expect(withdrawnBy(s, secondResume + HOUR)).toBe(withdrawn);
    // A pause still in force has not recorded its withdrawals yet: the on-chain total supplies them.
    const stillPaused = { ...s, segments: s.segments?.slice(0, 2) };
    expect(withdrawnBy(stillPaused, secondPause - 1n, withdrawn + 5n)).toBe(withdrawn);
    expect(withdrawnBy(stillPaused, secondPause, withdrawn + 5n)).toBe(withdrawn + 5n);
    expect(withdrawnBy({ ...s, segments: undefined }, secondResume, 0n)).toBe(0n);
  });

  it("hour shares still telescope across a pause", () => {
    const s = pausedTwice();
    const first = start / HOUR;
    const last = (secondResume + 5n * HOUR) / HOUR;
    let emitted = 0n;
    for (let hour = first; hour <= last; hour += 1n) emitted += hourShares(s, hour).emission;
    expect(emitted).toBe(cumulativeReleased(s, (last + 1n) * HOUR));
  });
});
