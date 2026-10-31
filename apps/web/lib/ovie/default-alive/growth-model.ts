/**
 * Trevor Blackwell's growth model (growth.tlb.org, gitlab.com/tlb/startuptools),
 * in months: revenue R0*e^(lr*t) and expenses E0*e^(le*t), lr = ln(1+g).
 * Pure math, no I/O.
 */

/** Projection horizon: 100 years. Past this the answer is "never". */
const HORIZON_MONTHS = 1200;

export interface GrowthPath {
  readonly e0: number;
  readonly r0: number;
  readonly le: number;
  readonly lr: number;
}

function integral(start: number, logGrowth: number, t: number): number {
  if (start === 0) return 0;
  return logGrowth === 0
    ? start * t
    : (start * (Math.exp(logGrowth * t) - 1)) / logGrowth;
}

/** Cumulative expense minus revenue from month 0 to month t. */
export function cumulativeNetBurn(path: GrowthPath, t: number): number {
  return integral(path.e0, path.le, t) - integral(path.r0, path.lr, t);
}

/** Month at which revenue first covers expenses. 0 if already; null never. */
export function breakevenMonth(path: GrowthPath): number | null {
  if (path.e0 <= path.r0) return 0;
  if (path.r0 <= 0 || path.lr <= path.le) return null;
  return (Math.log(path.e0) - Math.log(path.r0)) / (path.lr - path.le);
}

/** Peak cumulative net burn over [0, months]: the cash that window needs. */
export function peakNetBurn(path: GrowthPath, months: number): number {
  const breakeven = breakevenMonth(path);
  const t = breakeven === null ? months : Math.min(months, breakeven);
  return Math.max(0, cumulativeNetBurn(path, t));
}

export function bisect(
  f: (x: number) => number,
  lo: number,
  hi: number,
  iterations = 200
): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (f(mid) > 0) b = mid;
    else a = mid;
  }
  return (a + b) / 2;
}

/** First month at which cumulative net burn reaches cash. null: never. */
export function monthsUntilCashZero(
  path: GrowthPath,
  cash: number
): number | null {
  if (cash <= 0) return 0;
  const breakeven = breakevenMonth(path);
  const limit = breakeven ?? HORIZON_MONTHS;
  if (cumulativeNetBurn(path, limit) < cash) return null;
  return bisect(t => cumulativeNetBurn(path, t) - cash, 0, limit);
}

export function capitalToProfitability(path: GrowthPath): number | null {
  const breakeven = breakevenMonth(path);
  if (breakeven === null) return null;
  return Math.max(0, cumulativeNetBurn(path, breakeven));
}
