/** Model-free replay. Recorded observations never authorize canary or production use. */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { JEV_ROUTE } from '../invariants/jev-gateway.mjs';
import {
  digest,
  identitySuggestion,
  implementationSha256,
  positivePilotEvidence,
  prepareArtistIdentity,
} from './artist-identity.mjs';
import {
  buildArtistCorpus,
  SLICES,
  validateArtistCorpus,
} from './artist-identity-corpus.mjs';

const reportImplementationSha256 = digest([
  readFileSync(new URL(import.meta.url), 'utf8'),
  readFileSync(
    new URL('./artist-identity-corpus.mjs', import.meta.url),
    'utf8'
  ),
]);
const ratio = (n, d) => (d ? n / d : null);

function suggestions(corpus, observations, threshold) {
  const byId = new Map();
  for (const row of observations) {
    const example = corpus.examples.find(item => item.id === row.id);
    if (
      !example ||
      byId.has(row.id) ||
      !['fixture', 'gateway'].includes(row.basis)
    ) {
      throw new Error('duplicate, unknown or unclassified observation');
    }
    const prepared = prepareArtistIdentity(example.input, example.asOf);
    if (
      row.receipt?.requestFingerprint !== prepared.request.fingerprint ||
      row.receipt.identityImplementationSha256 !== implementationSha256
    ) {
      throw new Error('stale or mismatched observation version');
    }
    const result =
      row.receipt.status === 'evaluated'
        ? identitySuggestion(prepared, row.receipt.evaluation, threshold)
        : null;
    byId.set(row.id, {
      ...row,
      suggestion: result?.suggestion ?? { kind: 'review', candidateId: null },
    });
  }
  return byId;
}

function counts(examples, rows) {
  let suggested = 0;
  let correct = 0;
  let falseLinks = 0;
  let unresolvedSuggestions = 0;
  let review = 0;
  let noMatch = 0;
  for (const example of examples) {
    const suggestion = rows.get(example.id)?.suggestion;
    if (suggestion?.kind === 'candidate') {
      suggested += 1;
      if (example.expected === suggestion.candidateId) correct += 1;
      else if (example.label === 'unresolved') unresolvedSuggestions += 1;
      else falseLinks += 1;
    } else if (suggestion?.kind === 'no-match') noMatch += 1;
    else review += 1;
  }
  // One-sided exact binomial upper bound after zero known errors. Never report zero risk.
  const knownSuggested = suggested - unresolvedSuggestions;
  return {
    total: examples.length,
    suggested,
    correct,
    falseLinks,
    unresolvedSuggestions,
    precision: ratio(correct, suggested),
    knownFalseLinkRate: ratio(falseLinks, knownSuggested),
    zeroErrorUpper95:
      falseLinks === 0 && knownSuggested > 0
        ? 1 - 0.05 ** (1 / knownSuggested)
        : null,
    review,
    reviewWorkload: ratio(review, examples.length),
    noMatch,
    abstentionRate: ratio(review, examples.length),
  };
}

/** No heuristic scores enter calibration. Only labeled tuning observations choose concentration. */
export function calibrateArtistThreshold(corpus, observations) {
  const tuning = corpus.examples.filter(example => example.split === 'tuning');
  let best = null;
  for (const threshold of [0.5, 0.65, 0.8, 0.9, 0.95, 1]) {
    const rows = suggestions(corpus, observations, threshold);
    const metrics = counts(tuning, rows);
    if (
      metrics.suggested >= 2 &&
      metrics.falseLinks === 0 &&
      metrics.unresolvedSuggestions === 0 &&
      (!best || metrics.correct > best.correct)
    )
      best = { threshold, correct: metrics.correct };
  }
  return {
    threshold: best?.threshold ?? null,
    split: 'tuning',
    semantics: 'bounded answer-distribution concentration; advisory only',
    tuningIdsSha256: digest(tuning.map(example => example.id)),
  };
}

export function buildArtistReport({
  corpus,
  observations = [],
  evidence = null,
  now = Date.now(),
}) {
  validateArtistCorpus(corpus);
  const sourceShas = [
    ...new Set(corpus.examples.map(example => example.input.sourceSha)),
  ];
  if (sourceShas.length !== 1 || !/^[a-f0-9]{40}$/.test(sourceShas[0]))
    throw new Error('one exact source version required');
  const calibration = calibrateArtistThreshold(corpus, observations);
  const rows = suggestions(corpus, observations, calibration.threshold);
  const holdout = corpus.examples.filter(
    example => example.split === 'holdout'
  );
  const observed = [...rows.values()];
  const executed = observed.filter(row => row.basis === 'gateway');
  const latencies = executed
    .map(row => row.endToEndLatencyMs)
    .filter(value => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const percentile = p =>
    latencies.length ? latencies[Math.ceil(latencies.length * p) - 1] : null;
  const costKnown =
    executed.length > 0 &&
    executed.every(
      row =>
        Number.isFinite(row.receipt.billedCostUsd) &&
        row.receipt.billedCostUsd >= 0 &&
        Number.isFinite(row.retainedCostUsd) &&
        row.retainedCostUsd >= 0 &&
        Number.isFinite(row.reasoningCostUsd) &&
        row.reasoningCostUsd >= 0
    );
  const complete = holdout.every(example => rows.has(example.id));
  const reasons = [
    'read-only shadow; no canary admission or applied matches',
    'small contract corpus and zero observed errors cannot establish zero false-link risk',
  ];
  if (!positivePilotEvidence(evidence, now))
    reasons.push('JOV-6420 positive evidence and workload admission missing');
  if (!complete)
    reasons.push('held-out observations missing; counted as review workload');
  if (!executed.length)
    reasons.push(
      'zero recorded Gateway executions; no live quality, latency or economic proof'
    );
  return {
    schema: 'jev-artist-disposition/v1',
    route: JEV_ROUTE,
    issue: 'JOV-6425',
    sourceSha: sourceShas[0],
    identityImplementationSha256: implementationSha256,
    reportImplementationSha256,
    corpusVersion: corpus.version,
    corpusSha256: digest(corpus),
    observationsSha256: digest(observations),
    prerequisiteSha256: evidence ? digest(evidence) : null,
    disposition: positivePilotEvidence(evidence, now)
      ? 'inconclusive'
      : 'blocked',
    mode: 'read-only-shadow',
    appliedMatches: 0,
    canaryAuthorized: false,
    reasons,
    calibration,
    heldout: counts(holdout, rows),
    slices: Object.fromEntries(
      SLICES.map(slice => [
        slice,
        counts(
          holdout.filter(example => example.slice === slice),
          rows
        ),
      ])
    ),
    evidenceBasis: {
      recordedGateway: executed.length,
      fixture: observed.length - executed.length,
      executedByThisReport: 0,
      missing: corpus.examples.length - rows.size,
    },
    latencyMs: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      unknown: executed.length - latencies.length,
    },
    attributableCostUsd: costKnown
      ? executed.reduce(
          (sum, row) =>
            sum +
            row.receipt.billedCostUsd +
            row.retainedCostUsd +
            row.reasoningCostUsd,
          0
        )
      : null,
    costUnknown: !costKnown,
  };
}

/** CLI consumes optional recorded JSON; it has no inference, credential or network path. */
export function main(argv = process.argv.slice(2)) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (
      ![
        '--source-sha',
        '--corpus',
        '--observations',
        '--evidence',
        '--out',
      ].includes(argv[i]) ||
      !argv[i + 1]
    ) {
      throw new Error(
        'expected --source-sha SHA [--corpus JSON] [--observations JSON] [--evidence JSON] --out JSON'
      );
    }
    args.set(argv[i], argv[i + 1]);
  }
  const read = key =>
    args.has(key) ? JSON.parse(readFileSync(args.get(key), 'utf8')) : null;
  const corpus =
    read('--corpus') ?? buildArtistCorpus(args.get('--source-sha'));
  const report = buildArtistReport({
    corpus,
    observations: read('--observations') ?? [],
    evidence: read('--evidence'),
  });
  if (!args.has('--out')) throw new Error('--out required');
  writeFileSync(args.get('--out'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
