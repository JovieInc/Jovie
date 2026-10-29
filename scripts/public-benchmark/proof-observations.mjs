#!/usr/bin/env node
// Public Profile Benchmark -> proof-stat observations (proof-stat registry).
//
// Turns one weekly benchmark run (anonymized receipt + gate summary) into
// observations for the stats in apps/web/data/proof-stats/registry.json whose
// source is the benchmark, and into ratchets: every metric where Jovie loses
// a measured comparison or misses an absolute web-vitals target becomes a
// ratchet entry Summer files as an issue. Nothing is hidden.
//
// Comparative stats publish a value only when Jovie beats EVERY measured
// comparator by the declared margin and at least MIN_COMPARATORS were
// measured (no cherry-picking "faster than one of three"). They still need
// a founder-approved Summer card before any page renders them.
//
//   node scripts/public-benchmark/proof-observations.mjs \
//     --gate gate.json --receipt receipt.json --run-url <url> \
//     [--labels receipt.private.json] [--out dir] [--post]
//
// --post sends to $JOVIE_BASE_URL/api/internal/proof-stats with
// CONTENT_PUBLISH_SECRET; without the secret it prints and exits 0.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const REGISTRY_PATH = join(
  ROOT,
  'apps/web/data/proof-stats/registry.json'
);
export const MIN_COMPARATORS = 2;
export const SOURCE = 'workflow:public-benchmark';

// Absolute targets (web.dev "good" thresholds, mobile lab). Missing one is a
// ratchet even when Jovie beats every competitor.
export const ABSOLUTE_TARGETS = Object.freeze({
  'speed.lcp.median': { max: 2500, unit: 'ms' },
  'speed.tbt.median': { max: 200, unit: 'ms' },
  'speed.cls.median': { max: 0.1, unit: '' },
});

const GATE_METRIC = Object.freeze({
  'profile-speed.lcp': 'speed.lcp.median',
  'profile-speed.tbt': 'speed.tbt.median',
  'profile-speed.cls': 'speed.cls.median',
  'profile-speed.ttfb': 'speed.ttfb.median',
  'profile-speed.bytes': 'speed.bytes.median',
  'profile-agent-readiness.score': 'agent.score',
});

function median(stat) {
  return typeof stat?.median === 'number' ? stat.median : null;
}

/** Jovie's flagship medians from an (anonymized) receipt, keyed like registry refs. */
export function jovieMetrics(receipt) {
  const platform = receipt?.platforms?.find(p => p.id === 'jovie');
  const profile = platform?.profiles?.[0];
  if (!profile) return {};
  const speed = profile.speed ?? {};
  return {
    'speed.lcp.median': median(speed.lcp),
    'speed.tbt.median': median(speed.tbt),
    'speed.cls.median': median(speed.cls),
    'speed.ttfb.median': median(speed.ttfb),
    'speed.bytes.median': median(speed.bytes),
    'agent.score':
      typeof profile.agent?.score === 'number' ? profile.agent.score : null,
  };
}

/** platform id -> display label, from the private receipt (workflow only). */
export function labelsFrom(privateReceipt) {
  const labels = {};
  for (const platform of privateReceipt?.platforms ?? []) {
    if (platform.label) labels[platform.id] = platform.label;
  }
  return labels;
}

function anonLabel(id) {
  const letter = /^platform-([a-z])$/u.exec(id)?.[1];
  return letter ? `Platform ${letter.toUpperCase()}` : id;
}

export function buildProofObservations({
  registry,
  gate,
  receipt,
  runUrl,
  labels = {},
}) {
  const measuredAt = receipt.measuredAt;
  const jovie = jovieMetrics(receipt);
  const claims = new Map((gate?.claims ?? []).map(c => [c.id, c]));
  const observations = [];
  const ratchets = [];
  const skipped = [];

  for (const stat of registry.stats) {
    if (stat.source.kind !== 'benchmark') continue;
    if (stat.legalClass === 'plain') {
      const value = jovie[stat.source.ref];
      if (typeof value !== 'number') {
        skipped.push({ id: stat.id, reason: 'not measured this run' });
        continue;
      }
      observations.push({
        id: stat.id,
        observation: { value, measuredAt, source: SOURCE, receipt: runUrl },
      });
      continue;
    }
    // Comparative: the gate claim carries every comparator and its verdict.
    const claim = claims.get(stat.source.claim);
    const measured = (claim?.comparisons ?? []).filter(
      c => typeof c.value === 'number'
    );
    const wins = measured.filter(c => c.verdict === 'passes');
    if (!claim || typeof claim.jovie !== 'number') {
      skipped.push({ id: stat.id, reason: 'claim not in this run' });
      continue;
    }
    if (measured.length < MIN_COMPARATORS || wins.length !== measured.length) {
      skipped.push({
        id: stat.id,
        reason: `beats ${wins.length} of ${measured.length} measured comparators (needs all, minimum ${MIN_COMPARATORS})`,
      });
      continue;
    }
    observations.push({
      id: stat.id,
      observation: {
        value: wins.length,
        measuredAt,
        source: SOURCE,
        receipt: runUrl,
        breakdown: [
          { label: 'Jovie', value: claim.jovie, self: true },
          ...measured.map(c => ({
            label: labels[c.platform] ?? anonLabel(c.platform),
            value: c.value,
            self: false,
          })),
        ],
      },
    });
  }

  for (const claim of gate?.claims ?? []) {
    const metric = GATE_METRIC[claim.id] ?? claim.id;
    const higher = metric === 'agent.score';
    for (const c of claim.comparisons ?? []) {
      // "fails" also covers a tie inside the margin; only a strictly worse
      // Jovie value is a loss.
      const worse =
        typeof c.value === 'number' &&
        typeof claim.jovie === 'number' &&
        (higher ? claim.jovie < c.value : claim.jovie > c.value);
      if (c.verdict === 'fails' && worse) {
        ratchets.push({
          kind: 'loses',
          metric,
          platform: c.platform,
          jovie: claim.jovie,
          them: c.value,
        });
      }
    }
  }
  for (const [metric, target] of Object.entries(ABSOLUTE_TARGETS)) {
    const value = jovie[metric];
    if (typeof value === 'number' && value > target.max) {
      ratchets.push({
        kind: 'target',
        metric,
        jovie: value,
        target: target.max,
      });
    }
  }
  return { measuredAt, observations, ratchets, skipped };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch
) {
  const gatePath = argValue(argv, '--gate');
  const receiptPath = argValue(argv, '--receipt');
  const runUrl = argValue(argv, '--run-url');
  if (!gatePath || !receiptPath || !runUrl) {
    process.stderr.write(
      'usage: proof-observations.mjs --gate G --receipt R --run-url U [--labels P] [--out D] [--post]\n'
    );
    return 2;
  }
  const labelsPath = argValue(argv, '--labels');
  const result = buildProofObservations({
    registry: readJson(REGISTRY_PATH),
    gate: readJson(gatePath),
    receipt: readJson(receiptPath),
    runUrl,
    labels: labelsPath ? labelsFrom(readJson(labelsPath)) : {},
  });
  const outDir = argValue(argv, '--out');
  if (outDir) {
    // Ratchets carry anonymized ids only; they are safe to upload.
    writeFileSync(
      join(outDir, 'proof-ratchets.json'),
      `${JSON.stringify({ measuredAt: result.measuredAt, runUrl, ratchets: result.ratchets, skipped: result.skipped }, null, 2)}\n`
    );
  }
  process.stdout.write(
    `${JSON.stringify({ observations: result.observations.map(o => o.id), ratchets: result.ratchets.length, skipped: result.skipped })}\n`
  );
  if (!argv.includes('--post')) return 0;
  const secret = env.CONTENT_PUBLISH_SECRET;
  if (!secret) {
    process.stdout.write(
      'proof-observations: CONTENT_PUBLISH_SECRET not set; not posted\n'
    );
    return 0;
  }
  if (result.observations.length === 0) return 0;
  const base = env.JOVIE_BASE_URL ?? 'https://jov.ie';
  const response = await fetchImpl(`${base}/api/internal/proof-stats`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'x-content-actor': 'public-benchmark',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      reason: `weekly public benchmark ${result.measuredAt.slice(0, 10)}`,
      observations: result.observations,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    process.stderr.write(
      `proof-observations: intake answered ${response.status}: ${(await response.text()).slice(0, 500)}\n`
    );
    return 1;
  }
  return 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
