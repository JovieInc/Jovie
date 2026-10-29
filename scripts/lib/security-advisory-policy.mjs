// Pure policy for the security-advisory loop: group Dependabot alerts into one
// owned unit per (advisory, package), compute SLA, decide close-on-deployed.
// No I/O here so the tests are hermetic (they also run in the lanes self-test).

import { createHash } from 'node:crypto';

/** SLA by severity, in hours (Tim 2026-10-25: critical 48h, high 7d, medium 30d). */
export const SLA_HOURS = Object.freeze({
  critical: 48,
  high: 168,
  medium: 720,
});
export const LINEAR_PRIORITY = Object.freeze({
  critical: 1,
  high: 2,
  medium: 3,
});
const HOUR_MS = 3_600_000;

export function advisoryFingerprint(ghsaId, packageName) {
  const slug = String(packageName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const ghsa = String(ghsaId).toLowerCase();
  const base = `secadv-${ghsa}-${slug}`;
  return base.length <= 60
    ? base
    : `${base.slice(0, 51)}-${createHash('sha256').update(base).digest('hex').slice(0, 8)}`;
}

/** Group raw Dependabot alert objects by (GHSA, package). */
export function groupAlerts(alerts) {
  const groups = new Map();
  for (const alert of alerts) {
    const ghsa = alert.security_advisory?.ghsa_id;
    const pkg = alert.dependency?.package?.name;
    if (!ghsa || !pkg) continue;
    const key = advisoryFingerprint(ghsa, pkg);
    const g = groups.get(key) ?? {
      fingerprint: key,
      ghsa,
      package: pkg,
      ecosystem: alert.dependency.package.ecosystem ?? 'npm',
      severity: alert.security_advisory.severity,
      summary: alert.security_advisory.summary,
      scopes: new Set(),
      manifests: new Set(),
      patched: new Set(),
      alerts: [],
    };
    g.scopes.add(alert.dependency.scope ?? 'unknown');
    g.manifests.add(alert.dependency.manifest_path);
    const patched =
      alert.security_vulnerability?.first_patched_version?.identifier;
    if (patched) g.patched.add(patched);
    g.alerts.push({
      number: alert.number,
      state: alert.state,
      createdAt: alert.created_at,
      fixedAt: alert.fixed_at ?? null,
      url: alert.html_url,
    });
    groups.set(key, g);
  }
  return [...groups.values()].map(g => {
    const open = g.alerts.filter(a => a.state === 'open');
    const created = g.alerts
      .map(a => Date.parse(a.createdAt))
      .sort((a, b) => a - b);
    return {
      ...g,
      scopes: [...g.scopes].sort(),
      manifests: [...g.manifests].sort(),
      patched: [...g.patched].sort(),
      openCount: open.length,
      detectedAt: new Date(created[0]).toISOString(),
      // Runtime exposure wins when any occurrence is a runtime dependency.
      exposure: g.scopes.has('runtime') ? 'runtime' : 'development',
    };
  });
}

export function slaDueAt(group) {
  const hours = SLA_HOURS[group.severity];
  return hours == null
    ? null
    : new Date(Date.parse(group.detectedAt) + hours * HOUR_MS).toISOString();
}

/** An exception is valid only while unexpired and when it names a reason. */
export function activeException(group, exceptions, now = new Date()) {
  return (
    exceptions.find(
      e =>
        e.ghsa?.toLowerCase() === group.ghsa.toLowerCase() &&
        e.package === group.package &&
        e.reason?.trim() &&
        Date.parse(e.expires) > now.getTime()
    ) ?? null
  );
}

/**
 * Decide what the loop must do. `deployedAt` is the created_at of the newest
 * successful Production deployment; a fixed advisory closes only once a
 * production deploy at or after the fix landed (fixed on main AND deployed).
 */
export function planAdvisories({
  alerts,
  exceptions = [],
  deployedAt = null,
  now = new Date(),
}) {
  const groups = groupAlerts(alerts);
  const upserts = [];
  const closes = [];
  const awaitingDeploy = [];
  const breaches = [];
  const expiredExceptions = [];
  for (const g of groups) {
    if (!(g.severity in SLA_HOURS)) continue;
    const dueAt = slaDueAt(g);
    if (g.openCount > 0) {
      const exception = activeException(g, exceptions, now);
      const overdue = Date.parse(dueAt) < now.getTime();
      upserts.push({ ...g, dueAt, overdue, exception });
      if (overdue && !exception) breaches.push({ ...g, dueAt });
      continue;
    }
    const fixedMs = Math.max(
      ...g.alerts.map(a => Date.parse(a.fixedAt ?? a.createdAt))
    );
    if (
      g.alerts.every(a => a.state === 'fixed') &&
      deployedAt &&
      Date.parse(deployedAt) >= fixedMs
    ) {
      closes.push({
        ...g,
        dueAt,
        fixedAt: new Date(fixedMs).toISOString(),
        deployedAt,
      });
    } else if (g.alerts.every(a => a.state === 'fixed')) {
      awaitingDeploy.push({
        ...g,
        dueAt,
        fixedAt: new Date(fixedMs).toISOString(),
      });
    }
  }
  for (const e of exceptions) {
    if (Date.parse(e.expires) <= now.getTime()) expiredExceptions.push(e);
  }
  return { upserts, closes, awaitingDeploy, breaches, expiredExceptions };
}

export function issueTitle(g) {
  return `[${g.fingerprint}] ${g.severity.toUpperCase()} ${g.package}: ${g.summary}`.slice(
    0,
    200
  );
}

export function issueDescription(g) {
  const lines = [
    `Automated security-advisory intake (${g.ghsa}). Owned work, not a dashboard number.`,
    '',
    `- Severity: **${g.severity}**; SLA due **${g.dueAt}** (${SLA_HOURS[g.severity]}h from detection ${g.detectedAt})`,
    `- Exposure: **${g.exposure}** (${g.scopes.join(', ')}); manifests: ${g.manifests.join(', ')}`,
    `- Patched version(s): ${g.patched.join(', ') || 'none published'}`,
    `- Open alerts (${g.openCount}): ${g.alerts
      .filter(a => a.state === 'open')
      .map(a => `#${a.number}`)
      .join(', ')}`,
    `- Advisory: https://github.com/advisories/${g.ghsa}`,
  ];
  if (g.overdue)
    lines.push('', '**SLA BREACHED.** Fix before anything else in this lane.');
  if (g.exception)
    lines.push(
      '',
      `Active exception until ${g.exception.expires}: ${g.exception.reason}`
    );
  lines.push(
    '',
    '## Done when',
    '- Every Dependabot alert for this advisory is `fixed` on main (upgrade, override, or replace; no `--no-verify`, no weakened tests).',
    '- A Production deployment created after the fix landed has succeeded. The loop closes this issue itself; do not close it by hand.',
    '- If no patch exists, record a time-boxed entry in `scripts/security/advisory-exceptions.json` with the reachability proof.'
  );
  return lines.join('\n');
}
