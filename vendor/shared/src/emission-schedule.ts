/** Bit-exact continuous emission schedule matching EmissionController fixed-point math. */

export const WAD = 10n ** 18n;
export const HOUR = 3600n;
export const BPS = 10_000n;
const LN2_18 = 693_147_180_559_945_309n;

export type Schedule = {
  startTime: bigint;
  initialBalance: bigint;
  hourDecay18: bigint;
  platformBps: bigint;
  execBps: bigint;
  testBps: bigint;
};

export type CumulativeShares = {
  released: bigint;
  platform: bigint;
  exec: bigint;
  test: bigint;
  arb: bigint;
};

export type HourShares = {
  emission: bigint;
  platform: bigint;
  exec: bigint;
  test: bigint;
  arb: bigint;
};

/** Floor(a * b / d), matching OpenZeppelin Math.mulDiv for non-overflowing inputs. */
export function mulDiv(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("mulDiv: division by zero");
  return (a * b) / d;
}

/** 2^(-1/n) via bounded Taylor expansion — matches EmissionController._pow2Neg. */
export function pow2Neg(n: bigint): bigint {
  if (n === 0n) throw new Error("pow2Neg: n must be > 0");
  const x = mulDiv(LN2_18, WAD, n * WAD);
  let term = WAD;
  let sum = WAD;
  for (let i = 1n; i <= 24n; i++) {
    term = mulDiv(term, x, WAD) / i;
    if ((i & 1n) === 1n) sum -= term;
    else sum += term;
  }
  return sum;
}

/** Hourly decay factor q = 2^(-1/(24H)). */
export function hourDecay18(halfLifeDays: bigint): bigint {
  return pow2Neg(halfLifeDays * 24n);
}

/** Exponentiation by squaring in WAD: x^k with floor after each multiply. */
export function powWad(x: bigint, k: bigint): bigint {
  if (k === 0n) return WAD;
  let base = x;
  let exp = k;
  let result = WAD;
  while (exp > 0n) {
    if ((exp & 1n) === 1n) result = mulDiv(result, base, WAD);
    base = mulDiv(base, base, WAD);
    exp >>= 1n;
  }
  return result;
}

export function firstHour(schedule: Schedule): bigint {
  return schedule.startTime / HOUR;
}

function remain(schedule: Schedule, k: bigint): bigint {
  return mulDiv(schedule.initialBalance, powWad(schedule.hourDecay18, k), WAD);
}

function rk(schedule: Schedule, k: bigint): bigint {
  return schedule.initialBalance - remain(schedule, k);
}

/** Cumulative released amount R(t) at absolute unix time t. */
export function cumulativeReleased(schedule: Schedule, t: bigint): bigint {
  if (t <= schedule.startTime) return 0n;
  const s = t - schedule.startTime;
  const k = s / HOUR;
  const r = s % HOUR;
  const rk0 = rk(schedule, k);
  if (r === 0n) return rk0;
  const rk1 = rk(schedule, k + 1n);
  return rk0 + ((rk1 - rk0) * r) / HOUR;
}

export function cumulativeShares(schedule: Schedule, t: bigint): CumulativeShares {
  const released = cumulativeReleased(schedule, t);
  const platform = mulDiv(released, schedule.platformBps, BPS);
  const exec = mulDiv(released, schedule.execBps, BPS);
  const test = mulDiv(released, schedule.testBps, BPS);
  const arb = released - platform - exec - test;
  return { released, platform, exec, test, arb };
}

function sharesDelta(a: CumulativeShares, b: CumulativeShares): HourShares {
  return {
    emission: b.released - a.released,
    platform: b.platform - a.platform,
    exec: b.exec - a.exec,
    test: b.test - a.test,
    arb: b.arb - a.arb,
  };
}

/** Shares released during absolute hour `hourId` (activation hour is partial). */
export function hourShares(schedule: Schedule, hourId: bigint): HourShares {
  const hourStart = hourId * HOUR;
  const hourEnd = hourStart + HOUR;
  const a = hourStart < schedule.startTime ? schedule.startTime : hourStart;
  if (a >= hourEnd) {
    return { emission: 0n, platform: 0n, exec: 0n, test: 0n, arb: 0n };
  }
  return sharesDelta(cumulativeShares(schedule, a), cumulativeShares(schedule, hourEnd));
}

/** Arbitration share emitted in [from, to) clipped to [startTime, …). */
export function arbitrationEmitted(schedule: Schedule, from: bigint, to: bigint): bigint {
  if (to <= from) return 0n;
  const t1 = from < schedule.startTime ? schedule.startTime : from;
  const t2 = to;
  if (t2 <= t1) return 0n;
  return cumulativeShares(schedule, t2).arb - cumulativeShares(schedule, t1).arb;
}

export function buildSchedule(input: {
  startTime: bigint;
  initialBalance: bigint;
  halfLifeDays: bigint;
  platformBps: bigint;
  execBps: bigint;
  testBps: bigint;
}): Schedule {
  return {
    startTime: input.startTime,
    initialBalance: input.initialBalance,
    hourDecay18: hourDecay18(input.halfLifeDays),
    platformBps: input.platformBps,
    execBps: input.execBps,
    testBps: input.testBps,
  };
}
