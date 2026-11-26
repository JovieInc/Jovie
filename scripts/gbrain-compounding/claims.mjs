/**
 * Turn a health digest into durable, searchable claim records.
 *
 * Agents reuse these instead of re-deriving ops facts from live probes.
 * Each claim has a stable id, observedAt, sourceRefs, and a one-line fact.
 */
import { CLAIMS_INDEX_SLUG, DIGEST_SCHEMA, LATEST_SLUG } from './digest.mjs';

export const CLAIM_SCHEMA = 'jovie.gbrain-durable-claim/v1';
export const CLAIM_SLUG_PREFIX = 'ops/gbrain-health/claims/';

/**
 * @typedef {import('./digest.mjs').HealthDigest} HealthDigest
 * @typedef {{
 *   schema: typeof CLAIM_SCHEMA,
 *   id: string,
 *   slug: string,
 *   title: string,
 *   fact: string,
 *   kind: 'observed' | 'inference',
 *   status: import('./digest.mjs').HealthStatus | 'check-ok' | 'check-fail' | 'check-warn',
 *   checkName?: string,
 *   observedAt: string,
 *   sourceRefs: string[],
 * }} DurableClaim
 */

/**
 * @param {string} value
 */
function slugPart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * @param {HealthDigest} digest
 * @returns {DurableClaim[]}
 */
export function extractDurableClaims(digest) {
  if (!digest || digest.schema !== DIGEST_SCHEMA) {
    throw new Error('invalid-health-digest');
  }
  const day = digest.generatedAt.slice(0, 10);
  const sourceRefs = [
    LATEST_SLUG,
    `digest:${digest.generatedAt}`,
    `status:${digest.status}`,
  ];

  /** @type {DurableClaim[]} */
  const claims = [
    {
      schema: CLAIM_SCHEMA,
      id: `gbrain-health-status-${day}`,
      slug: `${CLAIM_SLUG_PREFIX}${day}/status`,
      title: `GBrain health status ${day}`,
      fact: `GBrain overall health was ${digest.status} at ${digest.generatedAt}.`,
      kind: 'observed',
      status: digest.status,
      observedAt: digest.generatedAt,
      sourceRefs,
    },
  ];

  for (const check of digest.checks) {
    const name = slugPart(check.name) || 'check';
    const outcome = check.ok
      ? 'check-ok'
      : check.required === false
        ? 'check-warn'
        : 'check-fail';
    claims.push({
      schema: CLAIM_SCHEMA,
      id: `gbrain-health-${name}-${day}`,
      slug: `${CLAIM_SLUG_PREFIX}${day}/${name}`,
      title: `GBrain check ${check.name} ${day}`,
      fact: `GBrain check ${check.name} was ${check.ok ? 'OK' : outcome === 'check-warn' ? 'WARN' : 'FAIL'} (${check.durationMs}ms): ${check.detail}`,
      kind: 'observed',
      status: outcome,
      checkName: check.name,
      observedAt: digest.generatedAt,
      sourceRefs: [...sourceRefs, `check:${check.name}`],
    });
  }

  if (digest.status !== 'healthy') {
    claims.push({
      schema: CLAIM_SCHEMA,
      id: `gbrain-health-recommendation-${day}`,
      slug: `${CLAIM_SLUG_PREFIX}${day}/recommendation`,
      title: `GBrain health recommendation ${day}`,
      fact: digest.recommendation,
      kind: 'inference',
      status: digest.status,
      observedAt: digest.generatedAt,
      sourceRefs,
    });
  }

  return claims;
}

/**
 * @param {DurableClaim} claim
 */
export function renderClaimPage(claim) {
  return [
    '---',
    `title: ${JSON.stringify(claim.title)}`,
    'type: gbrain-health-claim',
    `tags: [gbrain-health, durable-claim, ${claim.kind}, ${claim.status}]`,
    `observed_at: ${claim.observedAt}`,
    '---',
    '',
    `# ${claim.title}`,
    '',
    `schema: ${claim.schema}`,
    `id: ${claim.id}`,
    `kind: ${claim.kind}`,
    `status: ${claim.status}`,
    `observedAt: ${claim.observedAt}`,
    `sourceRefs: ${claim.sourceRefs.join(', ')}`,
    claim.checkName ? `checkName: ${claim.checkName}` : null,
    '',
    '## Fact',
    '',
    claim.fact,
    '',
    '## Provenance note',
    '',
    'Durable claim compounded from a GBrain health digest.',
    'Not Linear work acceptance, not an authority change, not a shipping receipt.',
  ]
    .filter(line => line !== null)
    .join('\n');
}

/**
 * @param {HealthDigest} digest
 * @param {string} body
 */
export function renderLatestPage(digest, body) {
  return [
    '---',
    'title: "GBrain health summary (latest)"',
    'type: gbrain-health',
    `tags: [gbrain-health, status:${digest.status}]`,
    `generated_at: ${digest.generatedAt}`,
    '---',
    '',
    body.trim(),
    '',
    '## Machine digest',
    '',
    '```json jovie.gbrain-health-digest/v1',
    JSON.stringify(digest, null, 2),
    '```',
  ].join('\n');
}

/**
 * @param {{
 *   day: string,
 *   digest: HealthDigest,
 *   claims: DurableClaim[],
 *   priorTrend?: object[],
 * }} args
 */
export function renderClaimsIndexPage(args) {
  const { day, digest, claims, priorTrend = [] } = args;
  const entry = {
    date: day,
    status: digest.status,
    generatedAt: digest.generatedAt,
    claimIds: claims.map(c => c.id),
    claimSlugs: claims.map(c => c.slug),
  };
  const trend = [
    ...priorTrend.filter(row => row && row.date !== day),
    entry,
  ].slice(-60);

  return [
    '---',
    'title: "GBrain health claims index"',
    'type: ops',
    'tags: [gbrain-health, durable-claim]',
    '---',
    '',
    '# GBrain health claims index',
    '',
    'Owner: `scripts/gbrain-compounding`. Daily health digests compound into',
    'durable claims under `ops/gbrain-health/claims/*` so agents reuse ops',
    'facts instead of re-deriving them.',
    '',
    `Latest day: ${day} (${digest.status}). Latest digest: [[${LATEST_SLUG}]].`,
    '',
    '## Latest claims',
    '',
    ...claims.map(c => `- [[${c.slug}]]: ${c.fact}`),
    '',
    '## Trend',
    '',
    '```json gbrain-health-claims-trend',
    JSON.stringify(trend, null, 2),
    '```',
    '',
    `Index slug: ${CLAIMS_INDEX_SLUG}`,
  ].join('\n');
}

/**
 * Parse prior trend block from an index page body (best-effort).
 * @param {string} body
 * @returns {object[]}
 */
export function parseClaimsTrend(body) {
  const match = String(body || '').match(
    /```json gbrain-health-claims-trend\n([\s\S]*?)\n```/
  );
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
