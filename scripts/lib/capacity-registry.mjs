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

import { listPrices, priceTask } from './capacity-pricing.mjs';

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
export function validateRegistry(
  registry,
  { agentIds, spendIds, modelIds } = {}
) {
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
  const pathIds = new Set();
  for (const row of registry.pricing?.paths ?? []) {
    const where = `pricing path ${row?.id ?? '?'}`;
    if (!row?.id || pathIds.has(row.id))
      errors.push(`${where}: id missing or duplicated`);
    pathIds.add(row?.id);
    if (!['api', 'credits', 'subscription'].includes(row?.accessPath)) {
      errors.push(`${where}: accessPath ${row?.accessPath} unknown`);
    }
    if (
      row?.modelRegistryId &&
      modelIds &&
      !modelIds.includes(row.modelRegistryId)
    ) {
      errors.push(
        `${where}: modelRegistryId ${row.modelRegistryId} not in the model registry`
      );
    }
    if (row?.accessPath === 'subscription' && !row.provider)
      errors.push(`${where}: subscription path needs a provider`);
    const owner = registry.providers?.find(p => p.id === row?.provider);
    if (row?.provider && !owner)
      errors.push(`${where}: provider ${row.provider} not in providers`);
    for (const a of row?.accounts ?? []) {
      if (owner && !owner.accounts?.some(x => x.id === a))
        errors.push(`${where}: account ${a} not on ${row.provider}`);
    }
  }
  for (const [roleId, role] of Object.entries(registry.roles ?? {})) {
    for (const c of role.candidates ?? []) {
      if (!pathIds.has(c.pathId))
        errors.push(
          `role ${roleId}: candidate ${c.model} pathId ${c.pathId} not in pricing.paths`
        );
    }
  }
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
  { now = Date.now(), live = {}, spend, models } = {}
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
      metrics: live.metrics?.providers?.[provider.id] ?? null,
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
  const view = {
    generatedAt: new Date(now).toISOString(),
    providers,
    totals: {
      monthlyUsd: providers.reduce((s, p) => s + p.monthlyUsd, 0),
      stale: providers.filter(p => p.freshness !== 'fresh').map(p => p.id),
    },
    paths: pathRows(registry, models),
    roles: Object.fromEntries(
      Object.keys(registry.roles ?? {}).map(id => [
        id,
        resolveRole(registry, id, live.watch?.models ?? {}),
      ])
    ),
    metricsMeta: live.metrics
      ? {
          windowDays: live.metrics.windowDays ?? null,
          mergedInWindow: live.metrics.mergedInWindow ?? null,
          readAt: live.metrics.readAt ?? null,
          incomplete: live.metrics.incomplete ?? null,
        }
      : null,
  };
  return { ...view, alerts: capacityAlerts(view) };
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

/**
 * Lane routing (Tim, 2026-10-25): unused Codex quota is lost, so Codex seats behind pace are the first
 * choice for lane work. Hyperagent when Codex has no headroom (every account ahead of pace or exhausted),
 * when the task needs a model Codex lacks, or when launch-critical time-to-merge matters and gem is loaded.
 * Remaining ties go to the lower measured cost per merge. Where Codex runs is separate: off gem
 * (`codex cloud`) only when the registry records a configured cloud environment, else on gem.
 *
 * @param {object} view evaluateRegistry() output
 * @param {{ gemLoaded?: boolean, launchCritical?: boolean, needsModelCodexLacks?: boolean }} [context]
 */
export function laneRoutingOrder(view, context = {}) {
  const codex = view.providers.find(p => p.id === 'openai-codex');
  const hyper = view.providers.find(p => p.id === 'hyperagent');
  const verdicts = (codex?.accounts ?? []).map(a => a.quota?.verdict);
  const behind = verdicts.filter(
    v => v === 'under-burning' || v === 'reset-passed'
  ).length;
  const onPace = verdicts.filter(v => v === 'on-pace').length;
  const codexHeadroom = behind + onPace > 0;
  const cost = provider =>
    provider?.metrics?.costPerMergedUsd ?? Number.POSITIVE_INFINITY;
  const reasons = [];
  let first = 'openai-codex';
  if (context.needsModelCodexLacks) {
    first = 'hyperagent';
    reasons.push('task needs a model Codex lacks');
  } else if (!codexHeadroom) {
    first = 'hyperagent';
    reasons.push('every Codex account is ahead of pace or exhausted');
  } else if (context.launchCritical && context.gemLoaded) {
    first = 'hyperagent';
    reasons.push(
      'launch-critical work while gem is loaded: Hyperagent runs in parallel off gem'
    );
  } else if (behind > 0) {
    reasons.push(`${behind} Codex account(s) behind pace: use it or lose it`);
  } else if (cost(hyper) < cost(codex)) {
    first = 'hyperagent';
    reasons.push(
      'Codex only on pace and Hyperagent has the lower measured cost per merge'
    );
  } else {
    reasons.push('Codex on pace; cost per merge is not higher than Hyperagent');
  }
  const slots = hyper?.limits?.laneSlots?.value;
  if (first === 'hyperagent' && Number.isFinite(slots)) {
    reasons.push(
      `Hyperagent lane is capped at ${slots} slot(s) until hyperagent/* PRs merge`
    );
  }
  const cloud = codex?.offGem?.status === 'configured';
  return {
    order:
      first === 'openai-codex'
        ? ['openai-codex', 'hyperagent']
        : ['hyperagent', 'openai-codex'],
    reasons,
    hyperagentSlots: Number.isFinite(slots) ? slots : null,
    codexWhere: context.gemLoaded
      ? cloud
        ? 'codex-cloud'
        : 'gem-throttled'
      : 'gem',
  };
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
  if (view.paths?.length) {
    lines.push(
      '',
      '## Cost by access path',
      '',
      registry.pricing.rule,
      '',
      '| Model | Path | Where | List $/MTok in / out | Note |',
      '|---|---|---|---|---|'
    );
    for (const row of view.paths) {
      const list = row.list
        ? `${row.list.inUsdPerMTok} / ${row.list.outUsdPerMTok}`
        : 'not listed';
      lines.push(
        `| ${row.model} | ${row.accessPath} | ${row.provider ?? 'direct'}${row.accounts.length ? ` (${row.accounts.join(', ')})` : ''} | ${list} | ${row.note ?? ''} |`
      );
    }
  }
  const roleIds = Object.keys(view.roles ?? {});
  if (roleIds.length) {
    lines.push('', '## Roles', '');
    for (const id of roleIds) {
      const r = view.roles[id];
      lines.push(
        `- **${id}**: ${r.description} Now: ${r.chosen ? `${r.chosen.label} (${r.chosen.model}) via ${r.chosen.pathId}` : 'no available model'}. Candidates: ${r.candidates.map(c => `${c.label} ${c.state}${c.preferred ? ' (preferred)' : ''}`).join('; ')}.`
      );
    }
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

/**
 * Alerts that need a human or a router. A credits burn above the pace that lasts to expiry is an
 * alarm only while cheaper use-or-lose capacity (a capped or pooled quota) is still under pace:
 * then the credits are paying for work the quota should have taken. When that capacity is at or
 * ahead of pace the burn is the right allocation and is judged on cost per merge instead (info).
 */
export function capacityAlerts(view) {
  const alerts = [];
  const spare = view.providers.filter(
    p =>
      ['capped-quota', 'subscription-pool'].includes(p.usageModel) &&
      p.policy.id !== 'unavailable' &&
      p.accounts.some(
        a =>
          a.status === 'active' &&
          a.quota?.verdict === 'under-burning' &&
          a.quota.freshness === 'fresh'
      )
  );
  for (const provider of view.providers) {
    for (const account of provider.accounts) {
      const credits = account.credits;
      if (
        account.status !== 'active' ||
        credits?.verdict !== 'exhausts-before-expiry'
      )
        continue;
      const burn = credits.burnPerDayUsd;
      const need = credits.requiredPerDayUsd;
      const detail = `${provider.label} burns ${usd(burn)}/day against ${usd(need)}/day that lasts to expiry`;
      alerts.push(
        spare.length > 0
          ? {
              id: `credits-before-cheaper-capacity:${provider.id}`,
              severity: 'alarm',
              provider: provider.id,
              message: `${detail}, while ${spare.map(p => p.label).join(', ')} ${spare.length === 1 ? 'is' : 'are'} under pace: route work there first.`,
            }
          : {
              id: `credits-burn-justified:${provider.id}`,
              severity: 'info',
              provider: provider.id,
              message: `${detail}. Cheaper quota is at or ahead of pace, so judge the burn on cost per merge.`,
            }
      );
    }
  }
  return alerts;
}

/**
 * Resolve a role (for example `planner`) to the model to use now: the first preferred candidate
 * whose availability is confirmed (registry status, or a live watch row `watch[model].available`),
 * else the first candidate that is available, else null. A preferred candidate that is only being
 * watched never wins until the watcher confirms it.
 */
export function resolveRole(registry, roleId, watch = {}) {
  const role = registry.roles?.[roleId];
  if (!role) return null;
  const state = c => {
    const seen = watch[c.model];
    if (seen?.available === true) return 'available';
    return c.availability?.status ?? 'unknown';
  };
  const ranked = role.candidates.map(c => ({ ...c, state: state(c) }));
  const chosen =
    ranked.find(c => c.preferred && c.state === 'available') ??
    ranked.find(c => c.state === 'available') ??
    null;
  return {
    role: roleId,
    description: role.description,
    chosen: chosen && {
      model: chosen.model,
      label: chosen.label,
      pathId: chosen.pathId,
    },
    candidates: ranked.map(c => ({
      model: c.model,
      label: c.label,
      pathId: c.pathId,
      preferred: Boolean(c.preferred),
      state: c.state,
      evidence: watch[c.model] ?? null,
    })),
  };
}

/** Pricing rows joined to list prices, with the same model on every path side by side. */
export function pathRows(registry, modelRegistry) {
  const prices = modelRegistry ? listPrices(modelRegistry) : {};
  return (registry.pricing?.paths ?? []).map(row => ({
    id: row.id,
    model: row.model,
    accessPath: row.accessPath,
    provider: row.provider ?? null,
    accounts: row.accounts ?? [],
    funding: row.funding ?? null,
    list: prices[row.modelRegistryId] ?? null,
    usableQuotaApiUsd: row.usableQuotaApiUsd ?? null,
    note: row.usableQuotaNote ?? row.priceWhenAvailable ?? null,
  }));
}

/**
 * Price one task on every path of a model, using each subscription account's live pace as the seat.
 * Returns the priced rows (one per account for subscription paths) cheapest routable first.
 */
export function priceModel(
  registry,
  modelRegistry,
  view,
  model,
  task,
  options = {}
) {
  const prices = listPrices(modelRegistry);
  const out = [];
  for (const row of registry.pricing.paths.filter(r => r.model === model)) {
    if (row.accessPath !== 'subscription') {
      out.push({
        ...priceTask(row, prices, task),
        account: row.accounts?.[0] ?? null,
      });
      continue;
    }
    const provider = view.providers.find(p => p.id === row.provider);
    for (const id of row.accounts ?? []) {
      const account = provider?.accounts.find(a => a.id === id);
      const quota = account?.quota;
      const windowUsd =
        ((account?.plan?.effectiveUsdMonthly ?? 0) * 7) / 30.4375;
      out.push({
        ...priceTask(
          row,
          prices,
          task,
          {
            usedPercent: quota?.usedPercent ?? null,
            elapsedPercent: quota?.elapsedPercent ?? null,
            usableQuotaApiUsd: row.usableQuotaApiUsd ?? null,
            planWindowUsd: windowUsd,
            status: account?.status,
          },
          {
            floorFraction: registry.pricing.subscriptionFloorFraction,
            band: registry.pricing.paceBandPercent,
          }
        ),
        account: id,
      });
    }
  }
  return rankPathsExport(out);
}

import { rankPaths as rankPathsExport } from './capacity-pricing.mjs';
