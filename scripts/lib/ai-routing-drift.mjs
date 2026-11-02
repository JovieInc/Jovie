/**
 * Drift between the documented AI routing and what is actually deployed.
 *
 * The documented routing is `apps/web/lib/ai/routing.json` (single source of
 * truth). The live signals are the Vercel AI Gateway spend report (by API key
 * and by model), the Gateway credit balance, the health of the Workers AI relay
 * Workers, and the Vercel env names the routing declares as live flags.
 *
 * Pure functions only; reads live in scripts/ai-routing-check.mjs.
 */

export const ROUTING_CHECK_SCHEMA = 'jovie.ai-routing-check/v1';
/** Key name the Gateway report uses for Vercel OIDC traffic (no API key). */
export const OIDC_KEY = 'oidc:jovie-eve-shadow';
const UNDECLARED_KEY_USD_PER_DAY = 0.05;
const UNDECLARED_MODEL_USD_PER_DAY = 0.02;

const round = (n, digits = 2) =>
  Number.isFinite(n) ? Number(n.toFixed(digits)) : null;

function finding(severity, type, subject, message, extra = {}) {
  return {
    fingerprint: `ai-routing:${type}:${subject}`,
    severity,
    type,
    subject,
    message,
    ...extra,
  };
}

/** Report key for a row: named API keys as-is, anonymous (OIDC) rows as OIDC_KEY. */
export function reportKey(row) {
  return row.api_key_name || row.key || OIDC_KEY;
}

/** Gateway $/day by report key, from `/v1/report?group_by=api_key_name` rows. */
export function usdPerDayByKey(rows, days) {
  const out = {};
  for (const row of rows) {
    const key = reportKey(row);
    out[key] = (out[key] ?? 0) + (row.total_cost ?? 0) / days;
  }
  return out;
}

export function usdPerDayByModel(rows, days) {
  const out = {};
  for (const row of rows) {
    const key = row.model ?? row.key ?? '(unknown)';
    out[key] = (out[key] ?? 0) + (row.total_cost ?? 0) / days;
  }
  return out;
}

/** Sum of the declared ceilings for one key across every caller that uses it. */
export function declaredCeilings(routing) {
  const ceilings = {};
  for (const caller of routing.callers ?? []) {
    if (!caller.gatewayKey || !Number.isFinite(caller.gatewayUsdPerDayMax))
      continue;
    ceilings[caller.gatewayKey] =
      (ceilings[caller.gatewayKey] ?? 0) + caller.gatewayUsdPerDayMax;
  }
  for (const [key, max] of Object.entries(routing.gatewayUsdPerDayMax ?? {})) {
    ceilings[key] = Math.max(ceilings[key] ?? 0, max);
  }
  return ceilings;
}

/** Every model the routing allows the Gateway to serve. */
export function declaredGatewayModels(routing) {
  const models = new Set();
  for (const caller of routing.callers ?? []) {
    if (caller.route === 'workers-ai-only') continue;
    for (const model of caller.models ?? []) models.add(model);
  }
  return models;
}

/** Workers AI list price per 1,000 neurons (USD); neurons are what Cloudflare bills credits against. */
export const WORKERS_AI_USD_PER_1K_NEURONS = 0.011;

/** USD per day by date from `aiInferenceAdaptiveGroups` rows grouped by `date`. */
export function workersAiUsdByDay(groups) {
  const out = {};
  for (const g of groups ?? []) {
    const day = g?.dimensions?.date;
    if (!day) continue;
    out[day] =
      (out[day] ?? 0) +
      ((g.sum?.totalNeurons ?? 0) / 1000) * WORKERS_AI_USD_PER_1K_NEURONS;
  }
  return out;
}

/** The executor that leases subscription aliases on the host (CODEX_LANE_SUBSCRIPTION_PROFILES). */
export const CODEX_POOL_EXECUTOR = 'scripts/lanes/codex_lane.py';
/** The only fields a host subscription profile may carry: no email, token or key. */
const PROFILE_FIELDS = ['emailSha256', 'home', 'slots'];
const FLOOR_PERCENT_MAX = 5;

/**
 * Subsidy pool ledger drift: the burn policy in routing.json must be the one Tim set
 * (floor at or under 5% and 1% today, no auto-redeem, no paid fallback), pools must not
 * carry identities, and when the host profiles are given (`profiles`: alias ->
 * {home, slots, emailSha256}) every alias signed in on the host must be a ledgered pool
 * and every ledgered codex pool must be signed in.
 */
export function evaluateSubsidyPools({ routing, profiles = null }) {
  const findings = [];
  const ledger = routing.subsidyPools;
  const policy = ledger?.policy;
  const invalid = (subject, message) =>
    findings.push(finding('high', 'subsidy-policy-invalid', subject, message));
  if (!ledger || !policy || !Array.isArray(ledger.pools)) {
    invalid(
      'subsidyPools',
      'routing.json has no subsidyPools.policy and pools list; executors fall back to defaults nobody reviewed.'
    );
    return findings;
  }
  const floor = policy.floorPercent;
  if (
    typeof floor !== 'number' ||
    !Number.isFinite(floor) ||
    floor < 0 ||
    floor > FLOOR_PERCENT_MAX
  )
    invalid(
      'floorPercent',
      `subsidyPools.policy.floorPercent is ${JSON.stringify(floor)}; it must be a number from 0 to ${FLOOR_PERCENT_MAX} (Tim: burn to 1% before asking for a reset).`
    );
  if (policy.autoRedeemResets !== false)
    invalid(
      'autoRedeemResets',
      'subsidyPools.policy.autoRedeemResets must be false: a banked reset is proposed to Tim, never redeemed by an executor.'
    );
  if (policy.paidFallback !== 'never-without-tim')
    invalid(
      'paidFallback',
      'subsidyPools.policy.paidFallback must be never-without-tim.'
    );
  if (policy.resetProposal !== 'only-when-every-pool-at-floor')
    invalid(
      'resetProposal',
      'subsidyPools.policy.resetProposal must be only-when-every-pool-at-floor.'
    );
  const ids = new Set();
  for (const pool of ledger.pools) {
    if (!pool?.id || ids.has(pool.id))
      invalid(
        pool?.id ?? '(missing id)',
        'Every subsidy pool needs a unique id.'
      );
    ids.add(pool?.id);
    if (/@/u.test(JSON.stringify(pool ?? {})))
      findings.push(
        finding(
          'critical',
          'subsidy-pool-identity',
          pool?.id ?? '(missing id)',
          `Subsidy pool ${pool?.id} carries an email-like value; the ledger names pools by alias only.`
        )
      );
  }
  if (!profiles) return findings;
  const ledgered = new Set(
    ledger.pools
      .filter(pool => pool?.executor === CODEX_POOL_EXECUTOR)
      .map(pool => pool.alias)
  );
  for (const [alias, profile] of Object.entries(profiles)) {
    const fields = Object.keys(profile ?? {}).sort();
    if (fields.join(',') !== PROFILE_FIELDS.join(','))
      findings.push(
        finding(
          'critical',
          'subsidy-profile-fields',
          alias,
          `Host profile ${alias} has fields ${fields.join(', ')}; only ${PROFILE_FIELDS.join(', ')} are allowed (no credentials or emails).`
        )
      );
    if (!ledgered.has(alias))
      findings.push(
        finding(
          'high',
          'subsidy-pool-unledgered',
          alias,
          `Subscription alias ${alias} is signed in on the host but routing.json subsidyPools does not list it, so its window is not measured or burned by policy.`
        )
      );
  }
  for (const alias of ledgered)
    if (!(alias in profiles))
      findings.push(
        finding(
          'high',
          'subsidy-pool-not-signed-in',
          alias,
          `routing.json lists subscription pool ${alias} but the host profiles do not sign it in; the ledger overstates capacity.`
        )
      );
  return findings;
}

/**
 * CODEX_LANE_SUBSCRIPTION_PROFILES from systemd drop-in text (the last assignment wins,
 * as in systemd). Returns null when no drop-in sets it.
 */
export function profilesFromDropIns(texts) {
  let raw = null;
  for (const text of texts)
    for (const line of text.split('\n')) {
      const match = /^\s*Environment=(?:"((?:[^"\\]|\\.)*)"|(\S+))\s*$/u.exec(
        line
      );
      if (!match) continue;
      const assignment =
        match[1] !== undefined
          ? match[1].replace(/\\(.)/gu, '$1')
          : (match[2] ?? '');
      const eq = assignment.indexOf('=');
      if (assignment.slice(0, eq) === 'CODEX_LANE_SUBSCRIPTION_PROFILES')
        raw = assignment.slice(eq + 1);
    }
  return raw === null ? null : JSON.parse(raw);
}

export function evaluateRouting({
  routing,
  keyRows = [],
  modelRows = [],
  days = 2,
  credits = null,
  health = {},
  envNames = null,
  workersAiByDay = null,
  profiles = null,
}) {
  const findings = evaluateSubsidyPools({ routing, profiles });
  const keyUsd = usdPerDayByKey(keyRows, days);
  const modelUsd = usdPerDayByModel(modelRows, days);
  const ceilings = declaredCeilings(routing);
  const knownKeys = new Set(Object.keys(ceilings));

  for (const [key, usd] of Object.entries(keyUsd)) {
    const ceiling = ceilings[key];
    if (ceiling === undefined) {
      if (usd >= UNDECLARED_KEY_USD_PER_DAY)
        findings.push(
          finding(
            'medium',
            'undeclared-gateway-key',
            key,
            `Gateway key ${key} spends $${round(usd)}/day and no caller in routing.json declares it. Declare the caller or move it to Workers AI.`,
            { usdPerDay: round(usd) }
          )
        );
    } else if (usd > ceiling) {
      findings.push(
        finding(
          'high',
          'gateway-over-ceiling',
          key,
          `Gateway key ${key} spends $${round(usd)}/day, over the $${round(ceiling)}/day its declared routing allows. The documented route (workers-first or workers-ai-only) is not what is running.`,
          { usdPerDay: round(usd), ceilingUsdPerDay: round(ceiling) }
        )
      );
    }
  }

  const allowedModels = declaredGatewayModels(routing);
  for (const [model, usd] of Object.entries(modelUsd)) {
    if (!allowedModels.has(model) && usd >= UNDECLARED_MODEL_USD_PER_DAY)
      findings.push(
        finding(
          'medium',
          'undeclared-gateway-model',
          model,
          `Gateway model ${model} spends $${round(usd)}/day and no Gateway-routed caller in routing.json declares it.`,
          { usdPerDay: round(usd) }
        )
      );
  }

  for (const [name, status] of Object.entries(health)) {
    if (status !== 'ok')
      findings.push(
        finding(
          'high',
          'relay-unhealthy',
          name,
          `Workers AI relay ${name} did not answer its health check (${status}). Workers-first callers are falling back to the Gateway.`
        )
      );
  }

  if (envNames) {
    for (const caller of routing.callers ?? []) {
      const flags = caller.liveFlags;
      if (!flags) continue;
      const present = envNames[flags.vercelProject];
      if (!present) continue;
      const missing = flags.envNames.filter(name => !present.includes(name));
      if (missing.length)
        findings.push(
          finding(
            'high',
            'live-flag-missing',
            caller.id,
            `${caller.id} is documented as ${caller.route} but ${flags.vercelProject} has no ${missing.join(', ')} in production, so it runs Gateway-only.`,
            { missing }
          )
        );
    }
  }

  const pageDays = routing.failover?.runwayPageDays ?? 3;
  let runway = null;
  if (credits && Number.isFinite(credits.balanceUsd)) {
    const totalUsd = Object.values(keyUsd).reduce((a, b) => a + b, 0);
    runway = totalUsd > 0 ? credits.balanceUsd / totalUsd : null;
    if (runway !== null && runway < pageDays)
      findings.push(
        finding(
          'critical',
          'gateway-runway',
          'vercel-ai-gateway-credits',
          `Gateway credits last ${round(runway, 1)} days ($${round(credits.balanceUsd)} at $${round(totalUsd)}/day), under ${pageDays}. Traffic fails over to Workers AI where a twin exists; top up or move callers.`,
          { runwayDays: round(runway, 1) }
        )
      );
  }

  return {
    schema: ROUTING_CHECK_SCHEMA,
    days,
    gatewayUsdPerDay: round(Object.values(keyUsd).reduce((a, b) => a + b, 0)),
    workersAiUsdByDay: workersAiByDay
      ? Object.fromEntries(
          Object.entries(workersAiByDay).map(([day, usd]) => [day, round(usd)])
        )
      : null,
    workersAiUsdPerDay: workersAiByDay
      ? round(Object.values(workersAiByDay).reduce((a, b) => a + b, 0) / days)
      : null,
    byKey: Object.fromEntries(
      Object.entries(keyUsd).map(([k, v]) => [
        k,
        { usdPerDay: round(v), ceilingUsdPerDay: round(ceilings[k] ?? null) },
      ])
    ),
    unreferencedCeilings: [...knownKeys].filter(key => !(key in keyUsd)),
    runwayDays: round(runway, 1),
    findings,
  };
}
