#!/usr/bin/env node
// Decides whether a signed-in Lighthouse suite passes, from the reports of
// this change (head) and, when there is one, of the commit it lands on (base)
// measured in the same job on the same runner.
//
// Why: the timing budgets in the .lighthouserc.*.pr.json files sat at the
// value main already measured (FCP 1100 ms against 1100.4 to 1114.9 ms), so
// about a quarter of merge groups failed on runner noise. A budget that only
// holds on a quiet runner does not tell a regression from a busy neighbour.
//
// What it checks, per page and per assertion in the suite's lhci config:
//   - Audits that do not depend on runner speed (accessibility, best
//     practices, layout shift, anything not in NOISY_AUDIT_POLICY) keep their
//     configured budget unchanged.
//   - Timing audits with a base measurement fail on a regression: head's best
//     run is worse than base's best run by more than the audit's tolerance
//     AND every head run is worse than every base run. They also fail when
//     head is past the ceiling derived from the configured budget (the
//     backstop against slow drift).
//   - Timing audits without a base measurement (no baseline build, or a page
//     that does not exist on base) keep their configured budget unchanged, so
//     a missing baseline can never make the gate weaker than it was.
//
// Statistic: best of the runs on each side, which is what `lhci assert` uses
// by default. Runner noise only ever makes a run slower, and simulated FCP
// here lands in separate modes about 10% apart (1103 / 1213 / 1251 ms), so
// the median of three flips between modes on identical code while the best of
// three does not. The medians are printed for the reader.
//
// Why the runs must not overlap: the first full run of this gate (job
// 130365864174, head and base the same app code) measured LCP on
// /app/library five times per side: head 2381 to 3210 ms, base 2191 to 3139.
// Best against best differed by 191 ms, over the 175 ms tolerance, on noise
// alone. Replaying those runs, any rule built on best, median or a spread
// estimate from so few runs failed unchanged code 2% to 20% of the time per
// audit. Runs that interleave are the same distribution as far as these few
// samples can tell; a regression larger than the runner's noise moves every
// head run past every base run. On unchanged code that happens about once in
// 2000 audits after the recheck (3 runs, then 3 more per side). The price is
// honest: a regression smaller than the spread between identical runs is not
// caught here, only by the ceiling.
//
// Usage: node scripts/lighthouse-relative-budget.mjs --config <lhci config>
//          --head <dir of lhr-*.json> [--base <dir of lhr-*.json>]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Tolerances are the smallest that the 7 days of merge-group runs before this
// gate (2026-11-04 to 2026-11-11) would have passed on unchanged code:
// best-of-three FCP on the same pages moved 1100 to 1120 ms (2%), TBT 352 to
// 488 ms, the onboarding performance score 0.87 to 0.91. A regression is the
// larger of the relative and the absolute tolerance, so a 20 ms page does not
// fail on 5 ms. Ceilings leave room above the same noise and nothing more.
export const NOISY_AUDIT_POLICY = Object.freeze({
  'categories:performance': Object.freeze({
    relativeTolerance: 0,
    absoluteTolerance: 0.04,
    ceilingSlack: 0.1,
  }),
  'first-contentful-paint': Object.freeze({
    relativeTolerance: 0.05,
    absoluteTolerance: 50,
    ceilingFactor: 1.2,
  }),
  'largest-contentful-paint': Object.freeze({
    relativeTolerance: 0.08,
    absoluteTolerance: 150,
    ceilingFactor: 1.2,
  }),
  'total-blocking-time': Object.freeze({
    relativeTolerance: 0.25,
    absoluteTolerance: 75,
    ceilingFactor: 1.5,
  }),
  'speed-index': Object.freeze({
    relativeTolerance: 0.1,
    absoluteTolerance: 150,
    ceilingFactor: 1.2,
  }),
  interactive: Object.freeze({
    relativeTolerance: 0.1,
    absoluteTolerance: 250,
    ceilingFactor: 1.2,
  }),
});

const SUPPORTED_LEVELS = new Set(['error', 'warn', 'off']);

/**
 * Flattens an lhci config's assertMatrix. Throws on anything this gate does
 * not evaluate itself, so a new assertion kind cannot be silently skipped.
 */
export function parseAssertions(config) {
  const assert = config?.ci?.assert;
  const matrix = assert?.assertMatrix;
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('lhci config has no ci.assert.assertMatrix to enforce.');
  }
  const unsupportedTopLevel = Object.keys(assert).filter(
    key => key !== 'assertMatrix'
  );
  if (unsupportedTopLevel.length > 0) {
    throw new Error(
      `Unsupported lhci assert options: ${unsupportedTopLevel.join(', ')}.`
    );
  }
  return matrix.map(entry => {
    const { matchingUrlPattern, assertions, ...rest } = entry;
    if (typeof matchingUrlPattern !== 'string' || !matchingUrlPattern) {
      throw new Error('Every assertMatrix entry needs a matchingUrlPattern.');
    }
    if (Object.keys(rest).length > 0) {
      throw new Error(
        `Unsupported assertMatrix options for ${matchingUrlPattern}: ${Object.keys(rest).join(', ')}.`
      );
    }
    const parsed = Object.entries(assertions ?? {}).map(([audit, value]) => {
      const [level, options = {}] = Array.isArray(value) ? value : [value];
      if (!SUPPORTED_LEVELS.has(level)) {
        throw new Error(`Unsupported assertion level for ${audit}: ${level}.`);
      }
      const kinds = Object.keys(options);
      if (
        kinds.length !== 1 ||
        !['minScore', 'maxNumericValue'].includes(kinds[0]) ||
        typeof options[kinds[0]] !== 'number'
      ) {
        throw new Error(
          `Unsupported assertion for ${audit}: ${JSON.stringify(options)}. Only a single minScore or maxNumericValue is evaluated.`
        );
      }
      return { audit, level, kind: kinds[0], limit: options[kinds[0]] };
    });
    if (parsed.length === 0) {
      throw new Error(`No assertions for ${matchingUrlPattern}.`);
    }
    return { matchingUrlPattern, assertions: parsed };
  });
}

/** True when the suite has a blocking timing assertion a baseline can judge. */
export function suiteNeedsBaseline(config) {
  return parseAssertions(config).some(entry =>
    entry.assertions.some(
      assertion =>
        assertion.level === 'error' && assertion.audit in NOISY_AUDIT_POLICY
    )
  );
}

function reportUrl(report) {
  return (
    report.finalUrl ?? report.finalDisplayedUrl ?? report.requestedUrl ?? ''
  );
}

// Base and head are served on the same origin one after the other, but compare
// by path so a port change could never unpair them.
function urlKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function readValue(report, audit, kind) {
  if (audit.startsWith('categories:')) {
    const score = report.categories?.[audit.slice('categories:'.length)]?.score;
    return typeof score === 'number' ? score : null;
  }
  const result = report.audits?.[audit];
  const value = kind === 'minScore' ? result?.score : result?.numericValue;
  return typeof value === 'number' ? value : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(values, kind) {
  return {
    values,
    best: kind === 'minScore' ? Math.max(...values) : Math.min(...values),
    worst: kind === 'minScore' ? Math.min(...values) : Math.max(...values),
    median: median(values),
  };
}

function ceilingFor(policy, kind, limit) {
  return kind === 'minScore'
    ? limit - policy.ceilingSlack
    : limit * policy.ceilingFactor;
}

function evaluateAssertion({ assertion, headReports, baseReports }) {
  const { audit, level, kind, limit } = assertion;
  const base = { audit, level, kind, limit };
  if (level === 'off') return { ...base, mode: 'off', status: 'pass' };

  const headValues = headReports.map(report => readValue(report, audit, kind));
  if (headValues.some(value => value === null)) {
    return {
      ...base,
      mode: 'strict',
      status: level === 'error' ? 'fail' : 'warn',
      reason: 'missing',
      detail: `a head report has no ${audit} value`,
    };
  }
  const head = summarize(headValues, kind);
  const worseThan = (value, reference) =>
    kind === 'minScore' ? reference - value : value - reference;
  const violated = reason => ({
    status: level === 'error' ? 'fail' : 'warn',
    reason,
  });

  const policy = NOISY_AUDIT_POLICY[audit];
  const baseValues = policy
    ? (baseReports ?? []).map(report => readValue(report, audit, kind))
    : [];
  const comparable =
    policy && baseValues.length > 0 && baseValues.every(v => v !== null);
  if (!comparable) {
    return {
      ...base,
      mode: 'strict',
      head,
      ...(worseThan(head.best, limit) > 0
        ? violated('budget')
        : { status: 'pass' }),
    };
  }

  const baseline = summarize(baseValues, kind);
  const ceiling = ceilingFor(policy, kind, limit);
  const regression = worseThan(head.best, baseline.best);
  const allowed = Math.max(
    Math.abs(baseline.best) * policy.relativeTolerance,
    policy.absoluteTolerance
  );
  // Every head run worse than every base run. Ties overlap.
  const separated = worseThan(head.best, baseline.worst) > 0;
  const result = {
    ...base,
    mode: 'relative',
    head,
    base: baseline,
    ceiling,
    regression,
    allowed,
    separated,
  };
  if (worseThan(head.best, ceiling) > 0) {
    return { ...result, ...violated('ceiling') };
  }
  if (regression > allowed && separated) {
    return { ...result, ...violated('regression') };
  }
  return { ...result, status: 'pass' };
}

/**
 * @param {{ config: object, headReports: object[], baseReports?: object[] | null }} input
 * `baseReports` null or empty means no baseline: every budget is enforced as
 * configured.
 */
export function evaluateSuite({ config, headReports, baseReports = null }) {
  const matrix = parseAssertions(config);
  const pages = [];
  for (const entry of matrix) {
    const pattern = new RegExp(entry.matchingUrlPattern);
    const matching = headReports.filter(report =>
      pattern.test(reportUrl(report))
    );
    if (matching.length === 0) {
      // lhci passes a pattern that matches nothing. A page that was never
      // measured is not a pass here.
      pages.push({
        pattern: entry.matchingUrlPattern,
        url: null,
        runs: { head: 0, base: 0 },
        results: [
          {
            audit: '(reports)',
            level: 'error',
            mode: 'strict',
            status: 'fail',
            reason: 'missing',
            detail: 'no head report matched this page',
          },
        ],
      });
      continue;
    }
    const keys = [
      ...new Set(matching.map(report => urlKey(reportUrl(report)))),
    ];
    for (const key of keys) {
      const head = matching.filter(report => urlKey(reportUrl(report)) === key);
      const base = (baseReports ?? []).filter(
        report => urlKey(reportUrl(report)) === key
      );
      pages.push({
        pattern: entry.matchingUrlPattern,
        url: key,
        runs: { head: head.length, base: base.length },
        results: entry.assertions.map(assertion =>
          evaluateAssertion({
            assertion,
            headReports: head,
            baseReports: base,
          })
        ),
      });
    }
  }
  const all = pages.flatMap(page => page.results);
  const failures = all.filter(result => result.status === 'fail');
  return {
    pages,
    passed: failures.length === 0,
    // Only a timing verdict against a baseline can be runner noise; more runs
    // on both sides settle it. A fixed budget miss is not retried.
    retryable:
      failures.length > 0 &&
      failures.every(
        result =>
          result.mode === 'relative' &&
          (result.reason === 'regression' || result.reason === 'ceiling')
      ),
    warnings: all.filter(result => result.status === 'warn').length,
  };
}

function formatValue(value, kind) {
  if (kind === 'minScore') return value.toFixed(2);
  return Math.abs(value) < 10 ? value.toFixed(3) : String(Math.round(value));
}

function formatRuns(summary, kind) {
  return `${formatValue(summary.best, kind)} (median ${formatValue(
    summary.median,
    kind
  )}; runs ${summary.values.map(value => formatValue(value, kind)).join(', ')})`;
}

export function formatSuite(name, evaluation) {
  const lines = [
    `Lighthouse budgets: ${name}: ${evaluation.passed ? 'PASS' : 'FAIL'}`,
  ];
  for (const page of evaluation.pages) {
    lines.push(
      `  Page ${page.url ?? page.pattern} (head runs ${page.runs.head}, base runs ${page.runs.base})`
    );
    for (const result of page.results) {
      if (result.mode === 'off') continue;
      const mark = result.status.toUpperCase().padEnd(4);
      const comparator = result.kind === 'minScore' ? '>=' : '<=';
      if (!result.head) {
        lines.push(`    ${mark} ${result.audit}: ${result.detail}`);
        continue;
      }
      if (result.mode === 'relative') {
        const sign = result.regression > 0 ? 'worse' : 'better';
        lines.push(
          `    ${mark} ${result.audit}: head ${formatRuns(result.head, result.kind)} vs base ${formatRuns(
            result.base,
            result.kind
          )}; ${formatValue(Math.abs(result.regression), result.kind)} ${sign}, allowed ${formatValue(
            result.allowed,
            result.kind
          )} worse${
            result.regression > result.allowed && !result.separated
              ? ' (runs overlap: noise, not a regression)'
              : ''
          }; ceiling ${comparator}${formatValue(result.ceiling, result.kind)}${
            result.reason ? ` [${result.reason}]` : ''
          }`
        );
      } else {
        lines.push(
          `    ${mark} ${result.audit}: head ${formatRuns(result.head, result.kind)}; budget ${comparator}${formatValue(
            result.limit,
            result.kind
          )}${
            result.audit in NOISY_AUDIT_POLICY ? ' (no base measurement)' : ''
          }${result.reason ? ` [${result.reason}]` : ''}`
        );
      }
    }
  }
  return lines;
}

export function readReports(directory) {
  if (!directory || !existsSync(directory)) return [];
  return readdirSync(directory)
    .filter(name => /^lhr-.*\.json$/.test(name))
    .sort()
    .map(name => JSON.parse(readFileSync(join(directory, name), 'utf8')));
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--config', '--head', '--base'].includes(flag) || !value) {
      throw new Error(
        'Usage: lighthouse-relative-budget.mjs --config <lhci config> --head <dir> [--base <dir>]'
      );
    }
    options[flag.slice(2)] = value;
  }
  if (!options.config || !options.head) {
    throw new Error('--config and --head are required.');
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const options = parseArgs(process.argv.slice(2));
  const evaluation = evaluateSuite({
    config: JSON.parse(readFileSync(options.config, 'utf8')),
    headReports: readReports(options.head),
    baseReports: options.base ? readReports(options.base) : null,
  });
  console.log(formatSuite(options.config, evaluation).join('\n'));
  process.exit(evaluation.passed ? 0 : 1);
}
