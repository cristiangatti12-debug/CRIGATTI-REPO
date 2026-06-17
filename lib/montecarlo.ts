// Monte-Carlo DCA projector. Pure functions, no React/Next deps — safe to import
// from API routes and client components alike.

export interface SimStats {
  muMonthly:    number;
  sigmaMonthly: number;
  nObs:         number;
}

export interface SimPoint {
  month:    number;
  p10:      number;
  p50:      number;
  p90:      number;
  invested: number;
}

export interface SimResult {
  series:          SimPoint[];
  stats:           SimStats;
  finalP10:        number;
  finalP50:        number;
  finalP90:        number;
  totalInvested:   number;
  lossProbability: number;
  lossCount:       number;
  pathsCount:      number;
}

const SIGMA_FLOOR = 1e-4;

export function computeMonthlyStats(monthlyCloses: number[]): SimStats {
  const closes = monthlyCloses.filter(c => Number.isFinite(c) && c > 0);
  if (closes.length < 2) return { muMonthly: 0, sigmaMonthly: 0, nObs: 0 };

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const mu = returns.reduce((s, r) => s + r, 0) / returns.length;
  // Sample standard deviation (n-1).
  const variance =
    returns.reduce((s, r) => s + (r - mu) * (r - mu), 0) /
    Math.max(1, returns.length - 1);
  const sigma = Math.max(Math.sqrt(variance), SIGMA_FLOOR);

  return { muMonthly: mu, sigmaMonthly: sigma, nObs: returns.length };
}

// Mulberry32: small, fast, seedable PRNG. Used only when seed is provided
// (deterministic tests). Otherwise falls back to Math.random.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform: two uniform draws → one standard normal sample.
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

export function runMonteCarlo(opts: {
  muMonthly:           number;
  sigmaMonthly:        number;
  monthlyContribution: number;
  horizonMonths:       number;
  paths?:              number;
  seed?:               number;
}): SimResult {
  const {
    muMonthly,
    sigmaMonthly,
    monthlyContribution,
    horizonMonths,
    paths = 500,
  } = opts;

  const sigma = Math.max(sigmaMonthly, SIGMA_FLOOR);
  const rand  = opts.seed !== undefined ? mulberry32(opts.seed) : Math.random;

  // values[month][path] — simulated portfolio value at end of `month`, for each path.
  const values: number[][] = [];
  for (let m = 0; m < horizonMonths; m++) values.push(new Array(paths));

  for (let k = 0; k < paths; k++) {
    let v = 0;
    for (let m = 0; m < horizonMonths; m++) {
      // Cash in at start of month, then market move applies to whole balance.
      v += monthlyContribution;
      const z = gaussian(rand);
      v *= Math.exp(muMonthly + sigma * z);
      values[m][k] = v;
    }
  }

  const series: SimPoint[] = [];
  for (let m = 0; m < horizonMonths; m++) {
    const sorted = values[m].slice().sort((a, b) => a - b);
    series.push({
      month:    m + 1,
      p10:      percentile(sorted, 0.10),
      p50:      percentile(sorted, 0.50),
      p90:      percentile(sorted, 0.90),
      invested: (m + 1) * monthlyContribution,
    });
  }

  const last = series[series.length - 1];
  const totalInvested = last?.invested ?? 0;

  let lossCount = 0;
  if (horizonMonths > 0) {
    const finalMonth = values[horizonMonths - 1];
    for (let k = 0; k < paths; k++) {
      if (finalMonth[k] < totalInvested) lossCount++;
    }
  }
  const lossProbability = paths > 0 ? lossCount / paths : 0;

  return {
    series,
    stats:           { muMonthly, sigmaMonthly: sigma, nObs: 0 },
    finalP10:        last?.p10 ?? 0,
    finalP50:        last?.p50 ?? 0,
    finalP90:        last?.p90 ?? 0,
    totalInvested,
    lossProbability,
    lossCount,
    pathsCount:      paths,
  };
}

// FNV-1a string hash → unsigned 32-bit int. Used to seed Monte Carlo from a
// ticker so the same ticker always reproduces the same simulated paths.
export function hashTicker(s: string): number {
  let h = 2166136261;
  const str = s.trim().toUpperCase();
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
