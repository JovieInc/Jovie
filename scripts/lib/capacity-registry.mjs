/**
 * Agent capacity registry: pure helpers (validate, evaluate, render, route).
 *
 * The data is ops/registry/capacity.json (metadata only; accounts by id and a
 * 12-hex email hash, never a secret). It joins the existing registries by id:
 * `agents` are keys of canon/agent-identities.json `identities`, `spendIds` are
 * ops/registry/spend.json provider ids. Live overlays (scripts/lanes/capacity_live.py
 * writes capacity-live.json on the lanes host) replace a snapshot only when newer.
 * Consumers: lanes (scripts/lanes/capacity_registry.py), the Ovie admin page,
 * canon/CAPACITY.md (generated, drift-checked by the unit test).
 */

export const SCHEMA = 'jovie.capacity-registry/v1';
export const USAGE_MODELS = [
  'uncapped-own-model',
  'capped-quota',
  'subscription-pool',
  'credits',
  'pay-per-token',
  'free',
];
const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
const PACE_BAND_PERCENT = 10;

const isObject = value =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const parseTime = value => {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

/** Structural errors only; an empty array means the registry is sound. */
export function validateRegistry(registry, { agentIds, spendIds } = {}) {
  const errors = [];
  if (!isObject(registry) || registry.schema !== SCHEMA) {
    return [`schema must be ${SCHEMA}`];
  }
  const thresholds = registry.thresholds;
  if (
    !isObject(thresholds) ||
    !isNumber(thresholds.liveMaxAgeHours) ||
    !isNumber(thresholds.manualMaxAgeDays)
  ) {
    errors.push('thresholds.liveMaxAgeHours and manualMaxAgeDays are required');
  }
  const policies = isObject(registry.policies) ? registry.policies : {};
  if (!Array.isArray(registry.providers) || registry.providers.length === 0) {
    errors.push('providers must be a non-empty array');
    return errors;
  }
  const seen = new Set();
  for (const provider of registry.providers) {
    const where = `provider ${provider?.id ?? '?'}`;
    if (!provider?.id || seen.has(provider.id)) {
      errors.push(`${where}: id missing or duplicated`);
      continue;
    }
    seen.add(provider.id);
    if (!USAGE_MODELS.includes(provider.usageModel)) {
      errors.push(`${where}: usageModel ${provider.usageModel} unknown`);
    }
    if (!policies[provider.policy?.id]) {
      errors.push(`${where}: policy.id ${provider.policy?.id} not in policies`);
    }
    for (const agent of provider.agents ?? []) {
      if (agentIds && !agentIds.includes(agent)) {
        errors.push(
          `${where}: agent ${agent} not in canon/agent-identities.json`
        );
      }
    }
    for (const id of provider.spendIds ?? []) {
      if (spendIds && !spendIds.includes(id)) {
        errors.push(`${where}: spendId ${id} not in ops/registry/spend.json`);
      }
    }
    if (!Array.isArray(provider.accounts) || provider.accounts.length === 0) {
      errors.push(`${where}: accounts must be a non-empty array`);
      continue;
    }
    for (const account of provider.accounts) {
      const label = `${where} account ${account?.id ?? '?'}`;
      if (!account?.id) errors.push(`${label}: id missing`);
      if (account?.emailSha256 && !/^[0-9a-f]{12}$/.test(account.emailSha256)) {
        errors.push(`${label}: emailSha256 must be a 12-hex prefix`);
      }
      for (const key of ['quota', 'credits']) {
        const fact = account?.[key];
        if (!fact) continue;
        if (fact.spendId && spendIds && !spendIds.includes(fact.spendId)) {
          errors.push(
            `${label}: credits.spendId ${fact.spendId} not in spend.json`
          );
        }
        if (fact.spendId && !fact.observedAt) continue;
        if (!fact.source || parseTime(fact.observedAt) === null) {
          errors.push(`${label}: ${key} needs source and observedAt`);
        }
      }
      if (account?.plan) {
        const { billedUsdMonthly, promoUntil, listUsdMonthly } = account.plan;
        if (
          promoUntil &&
          !(isNumber(billedUsdMonthly) && isNumber(listUsdMonthly))
        ) {
          errors.push(
            `${label}: promoUntil needs billedUsdMonthly and listUsdMonthly`
          );
        }
      }
    }
  }
  return errors;
}

/** Newest fact wins: a live overlay row replaces the snapshot only when newer. */
function overlayFact(snapshot, live) {
  if (!live) return snapshot;
  if (!snapshot) return live;
  const a = parseTime(snapshot.observedAt) ?? 0;
  const b = parseTime(live.observedAt) ?? 0;
  return b > a ? { ...snapshot, ...live } : snapshot;
}

function freshness(fact, now, thresholds) {
  const observed = parseTime(fact?.observedAt);
  if (observed === null) return { state: 'unknown', ageMs: null };
  const ageMs = now - observed;
  const limit = fact.live
    ? thresholds.liveMaxAgeHours * HOUR_MS
    : thresholds.manualMaxAgeDays * DAY_MS;
  return { state: ageMs > limit ? 'stale' : 'fresh', ageMs };
}

function quotaView(quota, now, thresholds) {
  if (!quota) return null;
  const fresh = freshness(quota, now, thresholds);
  let used = null;
  if (isNumber(quota.usedPercent)) used = quota.usedPercent;
  else if (isNumber(quota.remainingPercent))
    used = 100 - quota.remainingPercent;
  const resetsAt = parseTime(quota.resetsAt);
  const windowMs = isNumber(quota.windowMins)
    ? quota.windowMins * 60_000
    : null;
  let elapsed = null;
  if (resetsAt !== null && windowMs) {
    elapsed = Math.min(
      100,
      Math.max(0, ((now - (resetsAt - windowMs)) / windowMs) * 100)
    );
  }
  let verdict = 'unknown';
  if (quota.semantics === 'unconfirmed') verdict = 'unconfirmed';
  else if (resetsAt !== null && resetsAt <= now) verdict = 'reset-passed';
  else if (used !== null && elapsed !== null) {
    const delta = used - elapsed;
    verdict =
      delta > PACE_BAND_PERCENT
        ? 'over-burning'
        : delta < -PACE_BAND_PERCENT
          ? 'under-burning'
          : 'on-pace';
  }
  return {
    usedPercent: used,
    remainingPercent: used === null ? null : 100 - used,
    elapsedPercent: elapsed,
    paceDeltaPercent: used !== null && elapsed !== null ? used - elapsed : null,
    resetsAt: quota.resetsAt ?? null,
    cadence: quota.cadence ?? null,
    verdict,
    source: quota.source,
    observedAt: quota.observedAt,
    live: Boolean(quota.live),
    freshness: fresh.state,
    ageHours: fresh.ageMs === null ? null : fresh.ageMs / HOUR_MS,
    note: quota.note ?? null,
  };
}

function creditsView(credits, now, thresholds) {
  if (!credits) return null;
  const fresh = freshness(credits, now, thresholds);
  const expires = parseTime(credits.expiresAt);
  const daysLeft =
    expires === null ? null : Math.max(0, (expires - now) / DAY_MS);
  const requiredPerDay =
    daysLeft && isNumber(credits.balanceUsd)
      ? credits.balanceUsd / daysLeft
      : null;
  const burn = credits.burnPerDayUsd?.value ?? credits.burnPerDayUsd ?? null;
  let verdict = 'unknown';
  if (requiredPerDay !== null && isNumber(burn)) {
    verdict =
      burn > requiredPerDay * 1.1
        ? 'exhausts-before-expiry'
        : burn < requiredPerDay * 0.9
          ? 'unspent-at-expiry'
          : 'on-pace';
  }
  return {
    balanceUsd: credits.balanceUsd ?? null,
    expiresAt: credits.expiresAt ?? null,
    daysLeft,
    requiredPerDayUsd: requiredPerDay,
    burnPerDayUsd: isNumber(burn) ? burn : null,
    runwayDays:
      isNumber(burn) && burn > 0 && isNumber(credits.balanceUsd)
        ? credits.balanceUsd / burn
        : null,
    verdict,
    source: credits.source,
    observedAt: credits.observedAt,
    live: Boolean(credits.live),
    freshness: fresh.state,
    ageHours: fresh.ageMs === null ? null : fresh.ageMs / HOUR_MS,
  };
}

function priceView(plan, now) {
  if (!plan) return null;
  const promoUntil = parseTime(plan.promoUntil);
  const promoActive = promoUntil !== null && now < promoUntil;
  const unit = plan.billing === 'yearly' ? 12 : 1;
  const billed = plan.billedUsdMonthly ?? plan.listUsdMonthly ?? null;
  const effectiveMonthly =
    promoActive || promoUntil === null
      ? billed
      : (plan.listUsdMonthly ?? billed);
  return {
    name: plan.name,
    tier: plan.tier ?? null,
    listUsdMonthly: plan.listUsdMonthly ?? null,
    effectiveUsdMonthly: isNumber(plan.usdYearly)
      ? plan.usdYearly / unit
      : effectiveMonthly,
    promoActive,
    promoUntil: plan.promoUntil ?? null,
    promoDaysLeft:
      promoUntil === null ? null : Math.max(0, (promoUntil - now) / DAY_MS),
    billing: plan.billing ?? 'monthly',
    usdYearly: isNumber(plan.usdYearly) ? plan.usdYearly : null,
    source: plan.source,
    asOf: plan.asOf,
  };
}

/**
 * @param registry parsed capacity.json
 * @param {{now?: number, live?: {accounts?: Record<string, {quota?: object, credits?: object}>}, spend?: {providers?: object[]}}} [options]
 */
export function evaluateRegistry(
  registry,
  { now = Date.now(), live = {}, spend } = {}
) {
  const spendById = new Map((spend?.providers ?? []).map(p => [p.id, p]));
  /** Credits may name a spend.json row as their base; a newer own reading wins. */
  const creditsFromSpend = credits => {
    const row = credits?.spendId ? spendById.get(credits.spendId) : null;
    if (!credits?.spendId) return credits;
    const snap = row?.snapshot;
    const base = snap
      ? {
          balanceUsd: snap.balanceUsd,
          observedAt: snap.observedAt,
          source: `spend.json ${row.id}: ${snap.source}`,
          burnPerDayUsd: row.burnPerDayUsd,
          expiresAt: row.expiries?.[0]?.expiresAt,
        }
      : null;
    const { spendId: _spendId, ...own } = credits;
    return (
      overlayFact(
        base,
        own.observedAt
          ? { ...own, burnPerDayUsd: own.burnPerDayUsd ?? base?.burnPerDayUsd }
          : null
      ) ?? own
    );
  };
  const providers = registry.providers.map(provider => {
    const accounts = provider.accounts.map(account => {
      const key = `${provider.id}/${account.id}`;
      const liveRow = live.accounts?.[key];
      const plan = priceView({ ...provider.plan, ...account.plan }, now);
      return {
        id: account.id,
        aliases: account.aliases ?? [],
        emailSha256: account.emailSha256 ?? null,
        status: account.status ?? 'active',
        seats: account.seats ?? null,
        plan,
        quota: quotaView(
          overlayFact(account.quota, liveRow?.quota),
          now,
          registry.thresholds
        ),
        credits: creditsView(
          overlayFact(creditsFromSpend(account.credits), liveRow?.credits),
          now,
          registry.thresholds
        ),
        notes: account.notes ?? null,
      };
    });
    const joined = (provider.spendIds ?? [])
      .map(id => spendById.get(id))
      .filter(Boolean);
    const monthly = accounts
      .filter(a => a.status === 'active')
      .reduce((sum, a) => sum + (a.plan?.effectiveUsdMonthly ?? 0), 0);
    const states = accounts
      .flatMap(a => [a.quota?.freshness, a.credits?.freshness])
      .filter(Boolean);
    // A quota-bearing provider with an active account and no reading at all is unread, not fresh.
    if (
      ['capped-quota', 'subscription-pool', 'credits'].includes(
        provider.usageModel
      ) &&
      provider.policy.id !== 'unavailable'
    ) {
      for (const a of accounts) {
        if (a.status === 'active' && !a.quota && !a.credits)
          states.push('unknown');
      }
    }
    return {
      id: provider.id,
      label: provider.label,
      vendor: provider.vendor,
      agents: provider.agents ?? [],
      lane: provider.lane ?? null,
      usageModel: provider.usageModel,
      policy: { ...registry.policies[provider.policy.id], ...provider.policy },
      limits: provider.limits ?? {},
      decision: provider.decision ?? null,
      accounts,
      joinedSpend: joined.map(p => ({
        id: p.id,
        kind: p.kind,
        cap: p.cap ?? null,
        snapshot: p.snapshot ?? null,
      })),
      monthlyUsd: monthly,
      freshness: states.includes('stale')
        ? 'stale'
        : states.includes('unknown')
          ? 'unknown'
          : 'fresh',
    };
  });
  return {
    generatedAt: new Date(now).toISOString(),
    providers,
    totals: {
      monthlyUsd: providers.reduce((s, p) => s + p.monthlyUsd, 0),
      stale: providers.filter(p => p.freshness !== 'fresh').map(p => p.id),
    },
  };
}

/**
 * Delegation order for non-lane agents (coordination layer): uncapped own model
 * first, then capped quota that is under pace (burn before reset), then the shared
 * pool, then credits and pay-per-token. Stale or unconfirmed quota ranks behind fresh.
 */
export function routingOrder(view) {
  const rank = provider => {
    if (provider.usageModel === 'uncapped-own-model') return 0;
    if (provider.usageModel === 'capped-quota') {
      const verdicts = provider.accounts.map(a => a.quota?.verdict);
      return verdicts.includes('under-burning') ||
        verdicts.includes('reset-passed')
        ? 1
        : 3;
    }
    if (provider.usageModel === 'free') return 1.5;
    if (provider.usageModel === 'subscription-pool') return 2;
    if (provider.usageModel === 'credits') return 4;
    return 5;
  };
  return view.providers
    .filter(p => p.policy.id !== 'unavailable')
    .map(p => ({ id: p.id, rank: rank(p), freshness: p.freshness }))
    .sort((a, b) => a.rank - b.rank || (a.freshness === 'fresh' ? -1 : 1));
}

const usd = value =>
  value === null || value === undefined
    ? 'n/a'
    : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** The generated canon/CAPACITY.md body; deterministic for a fixed `now`. */
export function renderCanon(view, registry) {
  const lines = [
    '# Agent capacity (generated)',
    '',
    `Source: ops/registry/capacity.json (updated ${registry.updatedAt.slice(0, 10)}), joined to ops/registry/spend.json and canon/agent-identities.json. Generated by \`node scripts/capacity-registry.mjs canon --write\`; do not edit. Numbers below are the registry snapshot with the date each was read. Current and live numbers: \`node scripts/capacity-registry.mjs show\`, the Ovie admin Capacity page, or the lanes host file capacity-live.json.`,
    '',
    `Plan spend at the snapshot: ${usd(view.totals.monthlyUsd)}/mo across active accounts.`,
    '',
    '| Provider | Agents | Model | Plan (effective $/mo) | Remaining | Policy |',
    '|---|---|---|---|---|---|',
  ];
  for (const p of view.providers) {
    const remaining = p.accounts
      .map(a => {
        if (a.quota && a.quota.remainingPercent !== null) {
          return `${a.id} ${Math.round(a.quota.remainingPercent)}% left, resets ${(a.quota.resetsAt ?? '?').slice(0, 10)} (read ${a.quota.observedAt.slice(0, 10)})`;
        }
        if (a.credits)
          return `${a.id} ${usd(a.credits.balanceUsd)}${a.credits.expiresAt ? `, expires ${a.credits.expiresAt.slice(0, 10)}` : ''} (read ${a.credits.observedAt.slice(0, 10)})`;
        return `${a.id} ${a.status}`;
      })
      .join('; ');
    const plan = p.accounts[0]?.plan;
    const price = p.accounts.every(
      a => a.plan?.effectiveUsdMonthly === plan?.effectiveUsdMonthly
    )
      ? `${plan?.name ?? 'n/a'} ${usd(plan?.effectiveUsdMonthly ?? null)}`
      : `${plan?.name ?? 'n/a'} (per account)`;
    lines.push(
      `| ${p.label} | ${p.agents.join(', ') || '-'} | ${p.usageModel} | ${price} | ${remaining} | ${p.policy.id} |`
    );
  }
  lines.push('', '## Policies and delegation rules', '');
  for (const p of view.providers) {
    lines.push(
      `- **${p.label}** (${p.policy.id}): ${p.policy.rule}${p.policy.delegation ? ` Delegation: ${p.policy.delegation}` : ''}`
    );
  }
  lines.push(
    '',
    '## Routing order for non-lane agents',
    '',
    routingOrder(view)
      .map((r, i) => `${i + 1}. ${r.id}`)
      .join('\n'),
    ''
  );
  return lines.join('\n');
}
