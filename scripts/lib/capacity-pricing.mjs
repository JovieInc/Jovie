/**
 * Access-path pricing: the same model costs differently on an API, on given credits and on a
 * subscription seat. Rows live in ops/registry/capacity.json `pricing.paths`; list prices come from
 * scripts/backlog-orchestrator/config/model-registry.json (USD per million tokens). The Python port
 * (scripts/lanes/capacity_pricing.py) must agree on scripts/tests/fixtures/capacity-pricing-vectors.json.
 */

const MTOK = 1_000_000;
const num = value => typeof value === 'number' && Number.isFinite(value);

/** USD at list price for a task {inputTokens, outputTokens, cachedTokens}; cached priced as input when no cached price exists. */
export function apiListUsd(prices, task) {
  const cachedPrice = num(prices.cachedUsdPerMTok)
    ? prices.cachedUsdPerMTok
    : prices.inUsdPerMTok;
  return (
    ((task.inputTokens ?? 0) * prices.inUsdPerMTok +
      (task.outputTokens ?? 0) * prices.outUsdPerMTok +
      (task.cachedTokens ?? 0) * cachedPrice) /
    MTOK
  );
}

/** {model-registry id: {inUsdPerMTok, outUsdPerMTok, cachedUsdPerMTok}} */
export function listPrices(modelRegistry) {
  const out = {};
  for (const m of modelRegistry.models ?? []) {
    if (num(m.list_price_in) && num(m.list_price_out)) {
      out[m.id] = {
        inUsdPerMTok: m.list_price_in,
        outUsdPerMTok: m.list_price_out,
        cachedUsdPerMTok: num(m.list_price_cached) ? m.list_price_cached : null,
        model: m.model,
        channel: m.channel,
      };
    }
  }
  return out;
}

/**
 * Marginal cost of one task on a subscription seat.
 * seat: {usedPercent, elapsedPercent, usableQuotaApiUsd|null, planWindowUsd, status}
 * Behind pace by more than the band: floor x share. Within the band up to pace: the share. Ahead of
 * pace: rises linearly to the API price at exhaustion. Exhausted or lapsed: the API price, not routable.
 */
export function subscriptionMarginal(
  apiUsd,
  seat,
  { floorFraction = 0.1, band = 10 } = {}
) {
  const used = seat.usedPercent;
  const elapsed = seat.elapsedPercent;
  if (seat.status && seat.status !== 'active') {
    return {
      usd: apiUsd,
      class: 'unavailable',
      routable: false,
      reason: seat.status,
    };
  }
  if (!num(used) || !num(elapsed)) {
    return {
      usd: null,
      class: 'unknown',
      routable: true,
      reason: 'no-live-reading',
    };
  }
  if (used >= 100)
    return {
      usd: apiUsd,
      class: 'exhausted',
      routable: false,
      reason: 'exhausted',
    };
  const delta = used - elapsed;
  const cls =
    delta < -band ? 'behind-pace' : delta <= 0 ? 'on-pace' : 'ahead-of-pace';
  const known =
    num(seat.usableQuotaApiUsd) &&
    seat.usableQuotaApiUsd > 0 &&
    num(seat.planWindowUsd);
  if (!known) {
    return {
      usd: null,
      class: cls,
      routable: true,
      reason: 'usable-quota-unmeasured',
    };
  }
  const base = seat.planWindowUsd * (apiUsd / seat.usableQuotaApiUsd);
  let usd;
  if (cls === 'behind-pace') usd = base * floorFraction;
  else if (cls === 'on-pace') usd = base;
  else {
    const t = Math.min(1, Math.max(0, delta / Math.max(1, 100 - elapsed)));
    usd = base + (apiUsd - base) * t;
  }
  return { usd, class: cls, routable: true, reason: 'priced', baseUsd: base };
}

/** Price one task on one path row; `seat` is required for subscription rows. */
export function priceTask(row, prices, task, seat, options) {
  const p = prices[row.modelRegistryId];
  if (!p)
    return {
      id: row.id,
      accessPath: row.accessPath,
      usd: null,
      class: 'unpriced',
      routable: false,
      reason: 'no-list-price',
    };
  const apiUsd = apiListUsd(p, task);
  if (row.accessPath !== 'subscription') {
    return {
      id: row.id,
      accessPath: row.accessPath,
      usd: apiUsd,
      apiUsd,
      class: row.accessPath,
      routable: true,
      reason: 'list',
      funding: row.funding ?? null,
    };
  }
  return {
    id: row.id,
    accessPath: 'subscription',
    apiUsd,
    ...subscriptionMarginal(apiUsd, seat, options),
  };
}

/**
 * Cheapest routable path for a model. A subscription path with unknown USD but headroom (behind or on
 * pace) ranks as nearly free; ahead of pace without USD ranks after it; the API is last resort.
 */
export function rankPaths(priced) {
  const score = r => {
    if (!r.routable) return Number.POSITIVE_INFINITY;
    if (r.usd !== null) return r.usd;
    if (r.class === 'behind-pace') return 0;
    if (r.class === 'on-pace') return 1e-6;
    return Number.MAX_VALUE / 4;
  };
  return [...priced].sort((a, b) => score(a) - score(b));
}
