/**
 * Credentials and spend registry check.
 *
 * Summer was down from 2026-10-18 to 2026-10-20 because a time-boxed provider
 * grant (`SUMMER_GATEWAY_RECOVERY_GRANT`, expiresAt 2026-10-18T02:05Z) lapsed
 * and nothing watched its expiry. This module evaluates the metadata-only
 * registry in `ops/registry/` (no secret values, ever) and returns
 * fingerprinted findings plus remediation plans:
 *
 *   (a) expiry: 7 days and 1 day before any dated credential, grant or credit;
 *   (b) spend: runway under 14 days, or spend crossing 50/80/100% of a cap;
 *   (c) hygiene: credentials with no owner or no consumer, secret-like names in
 *       a store that no registry entry claims, and names a consumer reads that
 *       the store does not hold.
 *
 * Pure functions only; live reads and filing live in the callers.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const CREDENTIALS_SCHEMA = 'jovie.credentials-registry/v1';
export const SPEND_SCHEMA = 'jovie.spend-ledger/v1';
export const RUN_SCHEMA = 'jovie.credentials-spend-run/v1';
export const DEFAULT_THRESHOLDS = Object.freeze({
  expiryWarnDays: 7,
  expiryCriticalDays: 1,
  runwayAlertDays: 14,
  capAlertPercents: [50, 80, 100],
  observationMaxAgeDays: 8,
});

/** Statuses whose expiry no longer matters; they surface as retire candidates. */
const RETIRED_STATUSES = new Set(['retired', 'superseded']);
const VALID_STATUSES = new Set([
  'active',
  'pending',
  'superseded',
  'retired',
  'unused',
]);
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const PRIORITY_BY_SEVERITY = { critical: 1, high: 2, medium: 3, low: 4 };

/**
 * Names that hold secret material. Public keys, key ids, publishable keys and
 * plain config are excluded so the unowned count means something.
 */
const SECRET_NAME =
  /(KEY|TOKEN|SECRET|PASSWORD|PRIVATE|DATABASE_URL|REDIS_URL|KV_URL|DSN|AUTHORIZATION|CSC_LINK|CERTIFICATE|WEBHOOK_URL|DEPLOY_HOOK|LICENSE|GRANT|SIGNING|_AUTH$|SECRET_ID|PROFILE_BASE64|REGISTRY$)/i;
const NOT_SECRET_NAME =
  /^(NEXT_PUBLIC_|DOPPLER_(CONFIG|ENVIRONMENT|PROJECT)$)|(_KEY_ID|_PUBLIC_KEY|PUBLISHABLE_KEY(_STAGING)?|_ISSUER_ID|ITEM_KEY)$/i;

export function isSecretName(name) {
  return SECRET_NAME.test(name) && !NOT_SECRET_NAME.test(name);
}

export function daysUntil(iso, nowMs) {
  const at = Date.parse(iso ?? '');
  if (!Number.isFinite(at)) return null;
  return (at - nowMs) / DAY_MS;
}

const round = (value, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(digits));

function finding(fields) {
  return {
    ...fields,
    priority: PRIORITY_BY_SEVERITY[fields.severity] ?? null,
  };
}

function expiryFinding({ kind, id, label, owner, expiresAt, nowMs, t }) {
  const days = daysUntil(expiresAt, nowMs);
  if (days === null) return null;
  const left = round(days, 1);
  if (days <= 0)
    return finding({
      fingerprint: `${kind}-expiry:${id}:expired`,
      type: 'expiry',
      severity: 'critical',
      subject: id,
      owner,
      daysLeft: left,
      message: `${label} expired at ${expiresAt}.`,
    });
  if (days <= t.expiryCriticalDays)
    return finding({
      fingerprint: `${kind}-expiry:${id}:${t.expiryCriticalDays}d`,
      type: 'expiry',
      severity: 'critical',
      subject: id,
      owner,
      daysLeft: left,
      message: `${label} expires within ${t.expiryCriticalDays} day (${expiresAt}).`,
    });
  if (days <= t.expiryWarnDays)
    return finding({
      fingerprint: `${kind}-expiry:${id}:${t.expiryWarnDays}d`,
      type: 'expiry',
      severity: 'high',
      subject: id,
      owner,
      daysLeft: left,
      message: `${label} expires in ${left} days (${expiresAt}).`,
    });
  return null;
}

/** Shape errors make the run fail loudly instead of silently judging nothing. */
export function validateCredentialsRegistry(registry) {
  const errors = [];
  if (registry?.schema !== CREDENTIALS_SCHEMA)
    errors.push(`credentials schema must be ${CREDENTIALS_SCHEMA}`);
  const ids = new Set();
  for (const entry of registry?.credentials ?? []) {
    if (!entry.id) errors.push('credential without id');
    if (ids.has(entry.id)) errors.push(`duplicate credential id ${entry.id}`);
    ids.add(entry.id);
    if (!VALID_STATUSES.has(entry.status))
      errors.push(`${entry.id}: unknown status ${entry.status}`);
    for (const field of ['createdAt', 'expiresAt'])
      if (entry[field] && !Number.isFinite(Date.parse(entry[field])))
        errors.push(`${entry.id}: ${field} is not an ISO date`);
    for (const pattern of entry.names ?? []) {
      try {
        new RegExp(pattern);
      } catch {
        errors.push(`${entry.id}: invalid name pattern ${pattern}`);
      }
    }
  }
  return errors;
}

export function validateSpendLedger(ledger) {
  const errors = [];
  if (ledger?.schema !== SPEND_SCHEMA)
    errors.push(`spend schema must be ${SPEND_SCHEMA}`);
  const ids = new Set();
  for (const entry of ledger?.providers ?? []) {
    if (!entry.id) errors.push('spend entry without id');
    if (ids.has(entry.id)) errors.push(`duplicate spend id ${entry.id}`);
    ids.add(entry.id);
    if (entry.cap && !(entry.cap.amountUsd > 0))
      errors.push(`${entry.id}: cap.amountUsd must be positive`);
  }
  return errors;
}

export function evaluateCredentials(registry, nowMs, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...registry?.thresholds, ...thresholds };
  const findings = [];
  const retire = [];
  const unowned = [];
  const unconsumed = [];
  for (const entry of registry?.credentials ?? []) {
    if (RETIRED_STATUSES.has(entry.status)) {
      if (entry.retireAction) retire.push(entry);
      continue;
    }
    if (!entry.owner) unowned.push(entry.id);
    if (entry.status === 'active' && !(entry.consumers ?? []).length)
      unconsumed.push(entry.id);
    if (entry.status === 'active' || entry.status === 'pending') {
      const expiry = expiryFinding({
        kind: 'credential',
        id: entry.id,
        label: `${entry.label ?? entry.id} (${entry.provider})`,
        owner: entry.owner ?? null,
        expiresAt: entry.expiresAt,
        nowMs,
        t,
      });
      if (expiry) findings.push({ ...expiry, basis: entry.expiryBasis });
    }
  }
  if (unowned.length)
    findings.push(
      finding({
        fingerprint: 'credential-hygiene:no-owner',
        type: 'hygiene',
        severity: 'medium',
        subject: 'credentials',
        owner: null,
        items: unowned,
        message: `${unowned.length} registered credential(s) have no owner: ${unowned.join(', ')}.`,
      })
    );
  if (unconsumed.length)
    findings.push(
      finding({
        fingerprint: 'credential-hygiene:no-consumer',
        type: 'hygiene',
        severity: 'medium',
        subject: 'credentials',
        owner: null,
        items: unconsumed,
        message: `${unconsumed.length} active credential(s) have no recorded consumer: ${unconsumed.join(', ')}.`,
      })
    );
  if (retire.length)
    findings.push(
      finding({
        fingerprint: 'credential-hygiene:retire',
        type: 'hygiene',
        severity: 'low',
        subject: 'credentials',
        owner: null,
        items: retire.map(entry => entry.id),
        message: `${retire.length} superseded or retired credential(s) are still configured: ${retire
          .map(entry => `${entry.id} (${entry.retireAction})`)
          .join('; ')}.`,
      })
    );
  return findings;
}

/** Which registry entry claims each secret-like name in each store. */
export function claimNames(registry) {
  const claims = [];
  for (const entry of registry?.credentials ?? []) {
    for (const pattern of entry.names ?? [])
      claims.push({
        id: entry.id,
        stores: entry.stores ?? null,
        re: new RegExp(`^(?:${pattern})$`),
      });
  }
  return (storeId, name) =>
    claims.find(
      claim =>
        claim.re.test(name) &&
        (!claim.stores ||
          claim.stores.some(
            store => store === storeId || storeId.startsWith(`${store}:`)
          ))
    )?.id ?? null;
}

export function evaluateInventory(registry, nowMs, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...registry?.thresholds, ...thresholds };
  const claim = claimNames(registry);
  const unclaimed = [];
  const missing = [];
  const stale = [];
  let secretNames = 0;
  for (const store of registry?.stores ?? []) {
    const age = daysUntil(store.observedAt, nowMs);
    if (age === null || -age > t.observationMaxAgeDays) stale.push(store.id);
    for (const name of store.names ?? []) {
      if (!isSecretName(name)) continue;
      secretNames += 1;
      if (!claim(store.id, name)) unclaimed.push(`${store.id}/${name}`);
    }
    for (const name of store.referencedMissing ?? [])
      missing.push(`${store.id}/${name}`);
  }
  const findings = [];
  if (unclaimed.length)
    findings.push(
      finding({
        fingerprint: 'credential-hygiene:unowned-secret-names',
        type: 'hygiene',
        severity: 'medium',
        subject: 'inventory',
        owner: null,
        items: unclaimed,
        message: `${unclaimed.length} of ${secretNames} secret-like names in the inventory belong to no registered credential (no owner, no consumer on record).`,
      })
    );
  if (missing.length)
    findings.push(
      finding({
        fingerprint: 'credential-hygiene:referenced-missing',
        type: 'hygiene',
        severity: 'medium',
        subject: 'inventory',
        owner: null,
        items: missing,
        message: `${missing.length} secret name(s) are read by a consumer but absent from the store, so that consumer runs without it.`,
      })
    );
  if (stale.length)
    findings.push(
      finding({
        fingerprint: 'credential-hygiene:stale-inventory',
        type: 'measurement',
        severity: 'low',
        subject: 'inventory',
        owner: null,
        items: stale,
        message: `${stale.length} inventory store(s) were last read more than ${t.observationMaxAgeDays} days ago: ${stale.join(', ')}.`,
      })
    );
  return { findings, secretNames, unclaimed: unclaimed.length };
}

/**
 * Burn per day. Prefer the measured slope between the committed baseline and a
 * live read of the same cumulative counter; fall back to the declared value.
 */
export function burnRate(entry, live) {
  const base = entry.snapshot;
  if (
    live &&
    Number.isFinite(live.totalUsedUsd) &&
    Number.isFinite(base?.totalUsedUsd)
  ) {
    const days =
      (Date.parse(live.observedAt) - Date.parse(base.observedAt)) / DAY_MS;
    if (days >= 0.5) {
      const value = (live.totalUsedUsd - base.totalUsedUsd) / days;
      if (value >= 0)
        return { value, source: 'measured-slope', windowDays: round(days, 2) };
    }
  }
  if (Number.isFinite(entry.burnPerDayUsd?.value))
    return {
      value: entry.burnPerDayUsd.value,
      source: entry.burnPerDayUsd.source ?? 'declared',
      windowDays: null,
    };
  return null;
}

export function evaluateSpend(ledger, nowMs, live = {}, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...ledger?.thresholds, ...thresholds };
  const findings = [];
  const rows = [];
  const unmeasured = [];
  for (const entry of ledger?.providers ?? []) {
    const current = live[entry.id] ?? null;
    const observed = current ?? entry.snapshot ?? null;
    const balance = observed?.balanceUsd ?? null;
    const burn = burnRate(entry, current);
    const runwayDays =
      Number.isFinite(balance) && burn && burn.value > 0
        ? balance / burn.value
        : null;
    const capUsd = entry.cap?.amountUsd ?? null;
    const spent = observed?.spentUsd ?? null;
    const percent =
      Number.isFinite(capUsd) && Number.isFinite(spent)
        ? (spent / capUsd) * 100
        : null;
    rows.push({
      id: entry.id,
      provider: entry.provider,
      owner: entry.owner ?? null,
      observedAt: observed?.observedAt ?? null,
      live: Boolean(current),
      balanceUsd: round(balance),
      burnPerDayUsd: round(burn?.value ?? null),
      burnSource: burn?.source ?? null,
      runwayDays: round(runwayDays, 1),
      capUsd,
      capPeriod: entry.cap?.period ?? null,
      spentUsd: round(spent),
      capPercent: round(percent, 1),
    });
    if (!observed?.observedAt) {
      unmeasured.push(entry.id);
    } else {
      const age = -daysUntil(observed.observedAt, nowMs);
      if (age > t.observationMaxAgeDays) unmeasured.push(entry.id);
    }
    if (runwayDays !== null && runwayDays < t.runwayAlertDays) {
      findings.push(
        finding({
          fingerprint: `spend-runway:${entry.id}`,
          type: 'runway',
          severity: runwayDays < t.expiryWarnDays ? 'critical' : 'high',
          subject: entry.id,
          owner: entry.owner ?? null,
          runwayDays: round(runwayDays, 1),
          message: `${entry.label ?? entry.id}: $${round(balance)} left at $${round(burn.value)}/day (${burn.source}) is ${round(runwayDays, 1)} days of runway, under ${t.runwayAlertDays}.`,
        })
      );
    }
    if (percent !== null) {
      const crossed = [...t.capAlertPercents]
        .sort((a, b) => b - a)
        .find(level => percent >= level);
      if (crossed !== undefined) {
        findings.push(
          finding({
            fingerprint: `spend-cap:${entry.id}:${entry.cap.periodKey ?? entry.cap.period ?? 'cap'}:${crossed}`,
            type: 'cap',
            severity:
              crossed >= 100 ? 'critical' : crossed >= 80 ? 'high' : 'medium',
            subject: entry.id,
            owner: entry.owner ?? null,
            capPercent: round(percent, 1),
            message: `${entry.label ?? entry.id}: $${round(spent)} of $${capUsd} ${entry.cap.period ?? ''} cap (${round(percent, 1)}%) crossed ${crossed}%.`,
          })
        );
      }
    }
    for (const dated of entry.expiries ?? []) {
      const expiry = expiryFinding({
        kind: 'spend',
        id: `${entry.id}:${dated.id}`,
        label: `${entry.label ?? entry.id}: ${dated.label}`,
        owner: entry.owner ?? null,
        expiresAt: dated.expiresAt,
        nowMs,
        t,
      });
      if (expiry) findings.push(expiry);
    }
  }
  if (unmeasured.length)
    findings.push(
      finding({
        fingerprint: 'spend-measurement:unmeasured',
        type: 'measurement',
        severity: 'low',
        subject: 'spend',
        owner: null,
        items: unmeasured,
        message: `${unmeasured.length} spend line(s) have no reading in the last ${t.observationMaxAgeDays} days: ${unmeasured.join(', ')}.`,
      })
    );
  return { findings, rows };
}

export function sortFindings(findings) {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      (a.daysLeft ?? a.runwayDays ?? Infinity) -
        (b.daysLeft ?? b.runwayDays ?? Infinity) ||
      a.fingerprint.localeCompare(b.fingerprint)
  );
}

/**
 * Full evaluation. `live` carries optional fresh reads keyed by spend id
 * (`{ observedAt, balanceUsd, totalUsedUsd, spentUsd }`) and extra dated
 * credentials discovered at runtime (`credentials`).
 */
export function evaluateRegistry({
  credentials,
  spend,
  thirdPartyGrants = [],
  nowMs = Date.now(),
  live = {},
  thresholds = {},
}) {
  const errors = [
    ...validateCredentialsRegistry(credentials),
    ...validateSpendLedger(spend),
  ];
  if (errors.length) throw new Error(`registry invalid: ${errors.join('; ')}`);
  const merged = {
    ...credentials,
    credentials: mergeDiscovered(
      credentials.credentials ?? [],
      live.credentials ?? []
    ),
  };
  const inventory = evaluateInventory(merged, nowMs, thresholds);
  const spendResult = evaluateSpend(spend, nowMs, live.spend ?? {}, thresholds);
  const findings = sortFindings([
    ...evaluateCredentials(merged, nowMs, thresholds),
    ...inventory.findings,
    ...spendResult.findings,
    ...evaluateThirdPartyGrants(thirdPartyGrants, nowMs),
  ]);
  const counts = {
    credentials: merged.credentials.length,
    stores: (credentials.stores ?? []).length,
    storeNames: (credentials.stores ?? []).reduce(
      (sum, store) => sum + (store.names ?? []).length,
      0
    ),
    secretNames: inventory.secretNames,
    unclaimedSecretNames: inventory.unclaimed,
    spendLines: (spend.providers ?? []).length,
    thirdPartyGrants: thirdPartyGrants.length,
    findings: findings.length,
    bySeverity: Object.fromEntries(
      SEVERITY_ORDER.map(level => [
        level,
        findings.filter(item => item.severity === level).length,
      ])
    ),
  };
  return { findings, spend: spendResult.rows, counts };
}

/**
 * Live readers can report dated items the registry has not recorded yet (for
 * example a new Summer grant). They overlay by id: live expiry wins, and an
 * unknown id joins with owner taken from the declaration.
 */
export function mergeDiscovered(entries, discovered) {
  const byId = new Map(entries.map(entry => [entry.id, { ...entry }]));
  for (const item of discovered) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
  }
  return [...byId.values()];
}

/** One remediation plan per alerting finding, in the remediation-sweep shape. */
export function planFindings(findings, { minSeverity = 'medium' } = {}) {
  const limit = SEVERITY_ORDER.indexOf(minSeverity);
  return findings
    .filter(item => SEVERITY_ORDER.indexOf(item.severity) <= limit)
    .map(item => {
      const lines = [
        item.message,
        item.owner ? `Owner: ${item.owner}.` : null,
        item.items?.length
          ? `Items:\n${item.items
              .slice(0, 80)
              .map(name => `- ${name}`)
              .join(
                '\n'
              )}${item.items.length > 80 ? `\n- …and ${item.items.length - 80} more` : ''}`
          : null,
        'Source: ops/registry/credentials.json and ops/registry/spend.json (metadata only). Fix the underlying expiry, cap or ownership, then update the registry entry in the same PR.',
        `Fingerprint: \`${item.fingerprint}\``,
      ];
      return {
        fingerprint: item.fingerprint,
        title:
          `${item.message.split('. ')[0].replace(/\.$/, '')} (${item.fingerprint})`.slice(
            0,
            240
          ),
        description: lines.filter(Boolean).join('\n\n'),
        priority: item.priority ?? 3,
        reason: item.type,
        createStateName: 'Todo',
        reopenTerminal: true,
      };
    });
}

/** Months implied by GitHub's "Last used within the last N <unit>" text. */
export function lastUsedMonths(text) {
  if (!text) return null;
  if (/never/i.test(text)) return Infinity;
  const match = /(\d+)\s*(week|month|year)/i.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  return unit === 'week' ? n / 4.35 : unit === 'year' ? n * 12 : n;
}

/**
 * Grants held by third parties on Tim's and the org's accounts (Google linked
 * apps, GitHub OAuth/App authorizations, org app installations). Nothing is
 * revoked here; stale or unexplained grants are listed for review.
 */
export function evaluateThirdPartyGrants(
  grants,
  nowMs,
  { staleMonths = 6 } = {}
) {
  const review = [];
  for (const grant of grants ?? []) {
    const reasons = [];
    const months = lastUsedMonths(grant.lastUsed);
    if (months === Infinity) reasons.push('never used');
    else if (months !== null && months >= staleMonths)
      reasons.push(`last used ${grant.lastUsed} ago`);
    // Data-access grants must say why they exist; GitHub user authorizations
    // are mostly sign-in and are judged on use alone.
    if (!grant.purpose && /^(google|github-org-app)$/.test(grant.platform))
      reasons.push('no recorded purpose');
    if (/deprecated/i.test(grant.grantee ?? ''))
      reasons.push('grantee marked deprecated');
    if (grant.platform === 'github-org-app' && grant.updatedAt) {
      const idle = (nowMs - Date.parse(grant.updatedAt)) / DAY_MS;
      if (grant.writeAccess && idle > staleMonths * 30 && !grant.purpose)
        reasons.push(`write access, unchanged for ${Math.round(idle)} days`);
    }
    if (reasons.length)
      review.push({
        grant,
        label: `${grant.platform}:${grant.grantee} (${reasons.join('; ')})`,
      });
  }
  if (!review.length) return [];
  const risky = review.filter(item => item.grant.writeAccess);
  return [
    finding({
      fingerprint: 'third-party-grant:review',
      type: 'hygiene',
      severity: risky.length ? 'medium' : 'low',
      subject: 'third-party-grants',
      owner: 'tim',
      items: [...risky, ...review.filter(item => !item.grant.writeAccess)].map(
        item => item.label
      ),
      message: `${review.length} of ${grants.length} third-party grants need review (${risky.length} with write, send or delete access): stale, never used, or no recorded purpose. Review only; revoke at the provider.`,
    }),
  ];
}
