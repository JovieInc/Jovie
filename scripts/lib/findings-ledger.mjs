// One findings ledger for every static-analysis source (pure, no I/O).
//
// Sources: SonarCloud issues and gate, code-scanning (CodeQL, Semgrep, Trivy,
// Scorecard, osv-scanner), Dependabot, secret scanning, critical-path coverage
// gaps, knip dead code, mutation-score floor breaches. Each finding carries a
// fingerprint (dedupe key, also the Linear issue key), source, severity, file,
// first seen and an owner. The security-specific normalizer in
// scripts/security/findings stays the schema for deep security triage; this
// ledger is the cross-source loop state and reuses its path normalization.
//
// Secret values never enter the ledger: only type, location and alert number.

import { createHash } from 'node:crypto';
import { normalizePath } from '../security/findings/fingerprint.mjs';
import { compareRatchet } from './ratchet-core.mjs';

export const LEDGER_SCHEMA = 'jovie.findings-ledger/v1';
export const SOURCES = Object.freeze([
  'sonarcloud',
  'code-scanning',
  'dependabot',
  'secret-scanning',
  'coverage',
  'knip',
  'mutation',
]);
export const SEVERITIES = Object.freeze([
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);
const HOUR_MS = 3_600_000;

/**
 * Severity SLOs in hours. dispatchWithin: a remediation unit must exist
 * (0 = immediately, with a Summer incident). resolveWithin: open past this is
 * an SLO breach. null = batched tech debt, ranked by the WSJF portfolio.
 */
export const SLO = Object.freeze({
  critical: { dispatchWithin: 0, resolveWithin: 48 },
  high: { dispatchWithin: 24, resolveWithin: 168 },
  medium: { dispatchWithin: null, resolveWithin: 720 },
  low: { dispatchWithin: null, resolveWithin: null },
  info: { dispatchWithin: null, resolveWithin: null },
});

/** Default owners by source; path rules below refine code findings. */
const SOURCE_OWNER = Object.freeze({
  sonarcloud: 'ci',
  'code-scanning': 'security',
  dependabot: 'security',
  'secret-scanning': 'security-human',
  coverage: 'quality',
  knip: 'waste',
  mutation: 'quality',
});
const PATH_OWNERS = [
  [
    /^apps\/web\/(?:app\/api\/(?:billing|stripe|webhooks)|lib\/(?:stripe|billing|entitlements))/,
    'billing',
  ],
  [
    /^apps\/web\/(?:lib\/auth|app\/(?:signin|signup)|proxy)|(?:^|\/)auth\//,
    'auth',
  ],
  [/^\.github\//, 'ci'],
  [/^apps\/ios\/|^apps\/macos\//, 'apple'],
  [/^apps\/ovie\//, 'ovie'],
  [/^scripts\/lanes\//, 'gem-lanes'],
];

export function ownerFor(source, file) {
  const normalized = String(file ?? '').replace(/^\/+/, '');
  for (const [pattern, owner] of PATH_OWNERS) {
    if (pattern.test(normalized)) return owner;
  }
  return SOURCE_OWNER[source] ?? 'summer';
}

export function fingerprint(source, ...parts) {
  const slug = source.replace(/[^a-z0-9]+/g, '-');
  const digest = createHash('sha256')
    .update([source, ...parts.map(p => String(p ?? ''))].join('\u0000'))
    .digest('hex')
    .slice(0, 10);
  return `fnd-${slug}-${digest}`;
}

function entry(base) {
  const severity = SEVERITIES.includes(base.severity) ? base.severity : 'low';
  return {
    fingerprint: base.fingerprint,
    source: base.source,
    tool: base.tool ?? base.source,
    rule: base.rule ?? null,
    severity,
    title: String(base.title ?? base.rule ?? 'finding').slice(0, 200),
    file: base.file ? normalizePath(base.file) : null,
    line: base.line ?? null,
    url: base.url ?? null,
    state: base.state ?? 'open',
    firstSeen: base.firstSeen ?? null,
    fixedAt: base.fixedAt ?? null,
    count: base.count ?? 1,
    owner: base.owner ?? ownerFor(base.source, base.file),
    // Rotation and similar steps need a person; surfaced as an Ovie card.
    needsTim: base.needsTim === true,
  };
}

function codeScanningSeverity(alert) {
  const level = alert.rule?.security_severity_level;
  if (level) return level === 'critical' ? 'critical' : level;
  // Non-security rules carry only error/warning/note.
  return (
    { error: 'medium', warning: 'low', note: 'info' }[alert.rule?.severity] ??
    'low'
  );
}

/** Code-scanning alerts (CodeQL, Semgrep OSS, Trivy, Scorecard, osv-scanner). */
export function fromCodeScanning(alerts) {
  const groups = new Map();
  for (const alert of alerts) {
    const tool = String(alert.tool?.name ?? 'unknown');
    const rule = alert.rule?.id ?? 'unknown';
    const file = alert.most_recent_instance?.location?.path ?? null;
    const key = fingerprint('code-scanning', tool, rule, normalizePath(file));
    const open = alert.state === 'open';
    const g = groups.get(key);
    const next = entry({
      fingerprint: key,
      source: 'code-scanning',
      tool,
      rule,
      severity: codeScanningSeverity(alert),
      title: alert.rule?.description ?? rule,
      file,
      line: alert.most_recent_instance?.location?.start_line ?? null,
      url: alert.html_url,
      state: open ? 'open' : 'fixed',
      firstSeen: alert.created_at,
      fixedAt: alert.fixed_at ?? alert.dismissed_at ?? null,
    });
    if (!g) {
      groups.set(key, next);
      continue;
    }
    g.count += 1;
    if (open) g.state = 'open';
    if (Date.parse(next.firstSeen) < Date.parse(g.firstSeen))
      g.firstSeen = next.firstSeen;
    if (SEVERITIES.indexOf(next.severity) < SEVERITIES.indexOf(g.severity))
      g.severity = next.severity;
    if (!open && g.state !== 'open' && next.fixedAt > (g.fixedAt ?? ''))
      g.fixedAt = next.fixedAt;
  }
  return [...groups.values()];
}

export function fromDependabot(alerts) {
  return alerts.map(alert => {
    const ghsa = alert.security_advisory?.ghsa_id ?? `alert-${alert.number}`;
    const pkg = alert.dependency?.package?.name ?? 'unknown';
    return entry({
      // Same key as the advisory loop so the Linear card is shared, not duplicated.
      fingerprint: `secadv-${String(ghsa).toLowerCase()}-${pkg
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`.slice(0, 60),
      source: 'dependabot',
      tool: 'dependabot',
      rule: ghsa,
      severity: alert.security_advisory?.severity ?? 'low',
      title: `${pkg}: ${alert.security_advisory?.summary ?? ghsa}`,
      file: alert.dependency?.manifest_path ?? null,
      url: alert.html_url,
      state: alert.state === 'open' ? 'open' : 'fixed',
      firstSeen: alert.created_at,
      fixedAt: alert.fixed_at ?? alert.dismissed_at ?? null,
    });
  });
}

/** Secret-scanning alerts: type and location only, never the secret. */
export function fromSecretScanning(alerts) {
  return alerts.map(alert =>
    entry({
      fingerprint: fingerprint('secret-scanning', alert.number),
      source: 'secret-scanning',
      tool: 'github-secret-scanning',
      rule: alert.secret_type ?? 'secret',
      severity: 'critical',
      title: `Leaked ${alert.secret_type_display_name ?? alert.secret_type ?? 'secret'} (alert #${alert.number})`,
      url: alert.html_url,
      state: alert.state === 'open' ? 'open' : 'fixed',
      firstSeen: alert.created_at,
      fixedAt: alert.resolved_at ?? null,
      needsTim: true,
    })
  );
}

const SONAR_SEVERITY = {
  BLOCKER: 'high',
  CRITICAL: 'medium',
  MAJOR: 'low',
  MINOR: 'low',
  INFO: 'info',
};

/**
 * SonarCloud: issues are far too many for per-issue work, so each rule is one
 * ledger unit with a count (the ratchet counts issues, not units). The quality
 * gate is one unit per failing condition.
 */
export function fromSonar({ rules = [], gate = null, total = null }) {
  const out = rules.map(r =>
    entry({
      fingerprint: fingerprint('sonarcloud', 'rule', r.rule, r.severity),
      source: 'sonarcloud',
      tool: 'sonarcloud',
      rule: r.rule,
      severity: SONAR_SEVERITY[r.severity] ?? 'low',
      title: `${r.rule} (${r.count} issues)`,
      count: r.count,
      url: `https://sonarcloud.io/project/issues?id=JovieInc_Jovie&resolved=false&rules=${encodeURIComponent(r.rule)}`,
      firstSeen: r.firstSeen ?? null,
    })
  );
  for (const c of gate?.conditions ?? []) {
    if (c.status !== 'ERROR') continue;
    out.push(
      entry({
        fingerprint: fingerprint('sonarcloud', 'gate', c.metricKey),
        source: 'sonarcloud',
        tool: 'sonarcloud-gate',
        rule: c.metricKey,
        severity: /security|vulnerab/.test(c.metricKey) ? 'high' : 'medium',
        title: `Quality gate failing: ${c.metricKey} ${c.actualValue} (threshold ${c.errorThreshold})`,
        url: 'https://sonarcloud.io/project/overview?id=JovieInc_Jovie',
        firstSeen: gate.observedAt ?? null,
      })
    );
  }
  return { entries: out, total };
}

const CRITICAL_SURFACE =
  /rls|access-control|auth|proxy|stripe|billing|entitle|golden/i;

/** RED surfaces from the committed coverage snapshot that sit under the floor. */
export function fromCoverage(
  snapshot,
  { lineFloor = 90, branchFloor = 80 } = {}
) {
  const out = [];
  for (const [surface, s] of Object.entries(snapshot?.surfaces ?? {})) {
    if (s.status !== 'RED') continue;
    const gaps = [];
    if (s.coverage_pct < lineFloor)
      gaps.push(`lines ${s.coverage_pct}% < ${lineFloor}%`);
    if (s.branch_pct < branchFloor)
      gaps.push(`branches ${s.branch_pct}% < ${branchFloor}%`);
    if (!gaps.length) continue;
    out.push(
      entry({
        fingerprint: fingerprint('coverage', surface),
        source: 'coverage',
        tool: 'test-coverage-audit',
        rule: surface,
        severity: CRITICAL_SURFACE.test(surface) ? 'high' : 'medium',
        title: `Critical-path coverage gap in ${surface}: ${gaps.join(', ')}`,
        file: 'docs/TEST_RISK_REGISTER.md',
        firstSeen: snapshot.generated_at ?? null,
        owner: 'quality',
      })
    );
  }
  return out;
}

/** knip dead code: aggregate counts from the waste sweep (its ratchet owns the floor). */
export function fromWaste(waste) {
  const k = waste?.knip;
  if (!k) return [];
  const kinds = {
    unusedFiles: 'Unused files',
    unusedExports: 'Unused exports',
    unusedTypes: 'Unused exported types',
    unusedDependencies: 'Unused dependencies',
    unlistedDependencies: 'Unlisted dependencies',
  };
  return Object.entries(kinds)
    .filter(([key]) => Number(k[key]) > 0)
    .map(([key, label]) =>
      entry({
        fingerprint: fingerprint('knip', key),
        source: 'knip',
        tool: 'knip',
        rule: key,
        severity: 'low',
        title: `${label}: ${k[key]}`,
        count: Number(k[key]),
        firstSeen: waste.generatedAt ?? waste.measuredAt ?? null,
      })
    );
}

/** A failing main Mutation Diff run means a billing/auth/Stripe file is under its floor. */
export function fromMutation(run) {
  if (!run || run.conclusion !== 'failure') return [];
  return [
    entry({
      fingerprint: fingerprint('mutation', 'floor'),
      source: 'mutation',
      tool: 'mutation-diff',
      rule: 'mutation-score-floor',
      severity: 'high',
      title:
        'Mutation score under its floor on a billing/auth/Stripe file (or the harness is broken)',
      url: run.html_url,
      file: 'scripts/mutation-score-baseline.json',
      firstSeen: run.created_at,
      owner: 'quality',
    }),
  ];
}

/** Blind sources are findings: an unread source reads as a false zero. */
export function blindEntry(source, reason, observedAt) {
  return entry({
    fingerprint: fingerprint(source, 'blind'),
    source,
    tool: 'ledger',
    rule: 'blind-source',
    severity:
      source === 'secret-scanning' || source === 'dependabot'
        ? 'high'
        : 'medium',
    title: `${source} is unobserved: ${reason}`.slice(0, 200),
    firstSeen: observedAt,
    count: 0,
    owner: 'ci',
  });
}

export function sloState(finding, now = new Date()) {
  const slo = SLO[finding.severity];
  const seen = Date.parse(finding.firstSeen ?? '');
  if (!Number.isFinite(seen))
    return { ageHours: 0, breached: false, dueAt: null };
  const ageHours = (now.getTime() - seen) / HOUR_MS;
  const breached =
    finding.state === 'open' &&
    slo.resolveWithin !== null &&
    ageHours > slo.resolveWithin;
  return {
    ageHours,
    breached,
    dueAt:
      slo.resolveWithin === null
        ? null
        : new Date(seen + slo.resolveWithin * HOUR_MS).toISOString(),
  };
}

/**
 * Dispatch plan. critical: immediate Summer incident. high: owned issue now
 * (SLO 24h to dispatch). medium/low: one batch per (source, tool) for the
 * WSJF tech-debt portfolio. Secret leaks: rotation card (needsTim).
 */
export function planDispatch(findings) {
  const open = findings.filter(f => f.state === 'open');
  const incidents = open.filter(f => f.severity === 'critical');
  const issues = open.filter(f => f.severity === 'high');
  const batches = new Map();
  for (const f of open) {
    if (f.severity !== 'medium' && f.severity !== 'low') continue;
    const key = `fnd-batch-${f.source}-${f.tool}`
      .replace(/[^a-z0-9-]+/g, '-')
      .slice(0, 60);
    const b = batches.get(key) ?? {
      fingerprint: key,
      source: f.source,
      tool: f.tool,
      items: [],
      total: 0,
      bySeverity: {},
    };
    b.items.push(f);
    b.total += f.count;
    b.bySeverity[f.severity] = (b.bySeverity[f.severity] ?? 0) + f.count;
    batches.set(key, b);
  }
  const closes = findings
    .filter(f => f.state !== 'open')
    .map(f => f.fingerprint);
  return { incidents, issues, batches: [...batches.values()], closes };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
}

/** Open findings by source/severity, time-to-remediation p50/p95, SLO breaches. */
export function computeMetrics(findings, now = new Date()) {
  const openBySource = {};
  const openBySeverity = {};
  const bySourceSeverity = {};
  const ttr = [];
  let breaches = 0;
  const breachList = [];
  for (const f of findings) {
    if (f.state === 'open') {
      openBySource[f.source] = (openBySource[f.source] ?? 0) + f.count;
      openBySeverity[f.severity] = (openBySeverity[f.severity] ?? 0) + f.count;
      const row = (bySourceSeverity[f.source] ??= {});
      row[f.severity] = (row[f.severity] ?? 0) + f.count;
      if (sloState(f, now).breached) {
        breaches += 1;
        breachList.push({
          fingerprint: f.fingerprint,
          source: f.source,
          severity: f.severity,
        });
      }
    } else if (f.fixedAt && f.firstSeen) {
      ttr.push((Date.parse(f.fixedAt) - Date.parse(f.firstSeen)) / HOUR_MS);
    }
  }
  return {
    openBySource,
    openBySeverity,
    bySourceSeverity,
    sloBreaches: breaches,
    sloBreachList: breachList.slice(0, 50),
    timeToRemediationHours: {
      n: ttr.length,
      p50: percentile(ttr, 50),
      p95: percentile(ttr, 95),
    },
  };
}

/** Public-safe aggregates for the proof-stats registry: counts only, no files, rules or secrets. */
export function publicSafeStats(metrics) {
  const { critical = 0, high = 0 } = metrics.openBySeverity;
  return {
    openCriticalHigh: critical + high,
    sloBreaches: metrics.sloBreaches,
    remediationP50Hours: metrics.timeToRemediationHours.p50,
    remediationP95Hours: metrics.timeToRemediationHours.p95,
    sourcesMonitored: SOURCES.length,
  };
}

/** Total open per source against its lock_down baseline (ratchet-core; shrinking passes). */
export function ratchetReport(metrics, baseline) {
  const results = [];
  for (const source of SOURCES) {
    const ratchet = baseline?.ratchets?.[source];
    if (!ratchet) continue;
    const measured = metrics.openBySource[source] ?? 0;
    // ratchet-core rejects a zero baseline; at zero the only passing value is zero.
    if (ratchet.baseline === 0) {
      results.push({
        source,
        measured,
        baseline: 0,
        status: measured === 0 ? 'pass' : 'regression',
        ok: measured === 0,
        proposeNewBaseline: null,
      });
      continue;
    }
    // Baselines omit the policy: a ledger ratchet is always exact (no margin, no epsilon).
    const verdict = compareRatchet(
      { value: measured, sampleSize: 1 },
      {
        ...ratchet,
        policy: ratchet.policy ?? {
          marginFraction: 0,
          improveEpsilon: 0,
          minSampleSize: 0,
        },
      }
    );
    results.push({
      source,
      measured,
      baseline: ratchet.baseline,
      status: verdict.status,
      ok: verdict.ok,
      proposeNewBaseline: verdict.proposeNewBaseline ?? null,
    });
  }
  return results;
}
