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

export function evaluateRouting({
  routing,
  keyRows = [],
  modelRows = [],
  days = 2,
  credits = null,
  health = {},
  envNames = null,
  workersAiByDay = null,
}) {
  const findings = [];
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
