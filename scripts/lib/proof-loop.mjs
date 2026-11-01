// Proof-stat loop for Summer (apps/web/data/proof-stats/registry.json).
//
// One pass of the self-driving proof system:
//   ideate     rank every stat by marketing value x feasibility
//   establish  one Linear issue per proposed stat that has no producer yet
//   ratchet    one issue per benchmark loss or missed web-vitals target
//   publish    a founder approval card (never default-approve) for every
//              comparative claim that is true, fresh and only waiting on review
//   keep true  one issue per live public stat that went stale, plus the win
//              texts for milestone events since the last pass
//
// Plans use the remediation-sweep shape (stable fingerprint, upsert). Every
// stage records start and end timestamps in the run record (measure
// everything). Pure: callers inject the feed, the ratchets and the clock.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const REGISTRY_PATH = 'apps/web/data/proof-stats/registry.json';

export function loadRegistry(root) {
  return JSON.parse(readFileSync(resolve(root, REGISTRY_PATH), 'utf8'));
}

const fmt = n => Number(n).toLocaleString('en-US');

export function ideate(registry) {
  return registry.stats
    .filter(stat => stat.status !== 'retired')
    .map(stat => ({
      id: stat.id,
      score: stat.marketing.value * stat.marketing.feasibility,
      value: stat.marketing.value,
      feasibility: stat.marketing.feasibility,
      status: stat.status,
      visibility: stat.visibility,
      legalClass: stat.legalClass,
      why: stat.marketing.why,
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function plan({ fingerprint, title, lines, priority = 3, reason }) {
  return {
    fingerprint,
    title: title.slice(0, 240),
    description: [...lines, `Fingerprint: \`${fingerprint}\``]
      .filter(Boolean)
      .join('\n\n'),
    priority,
    reason,
    createStateName: 'Todo',
    reopenTerminal: false,
  };
}

/** Proposed stats with no observation yet: file the instrumentation work. */
export function establishPlans(registry, feed) {
  const measured = new Set(
    (feed?.stats ?? [])
      .filter(stat => stat.state !== 'missing' && stat.state !== 'not-live')
      .map(stat => stat.id)
  );
  return registry.stats
    .filter(stat => stat.status === 'proposed' && !measured.has(stat.id))
    .map(stat =>
      plan({
        fingerprint: `proof-stat-establish-${stat.id}`,
        title: `Establish proof stat ${stat.id}: ${stat.label}`,
        reason: 'proof-stat-establish',
        priority: stat.marketing.value >= 4 ? 2 : 3,
        lines: [
          `Build the producer for \`${stat.id}\` (${stat.visibility}, ${stat.legalClass}). Source: ${stat.source.kind} \`${stat.source.ref}\`.`,
          stat.source.note,
          stat.source.kind === 'production'
            ? 'Add a query to apps/web/lib/proof-stats/queries.server.ts.'
            : 'Post observations to /api/internal/proof-stats (CONTENT_PUBLISH_SECRET bearer, x-content-actor) with a receipt URL. Then set status to "measuring" in the registry.',
          `Why it matters: ${stat.marketing.why} (value ${stat.marketing.value}/5, feasibility ${stat.marketing.feasibility}/5).`,
        ],
      })
    );
}

const METRIC_NAMES = {
  'speed.lcp.median': 'largest contentful paint',
  'speed.tbt.median': 'total blocking time',
  'speed.cls.median': 'layout shift',
  'speed.ttfb.median': 'server response time',
  'speed.bytes.median': 'page weight',
  'agent.score': 'agent-readiness score',
};

/** Benchmark losses and missed targets: one ratchet issue each. */
export function ratchetPlans(ratchetsDoc) {
  return (ratchetsDoc?.ratchets ?? []).map(r => {
    const name = METRIC_NAMES[r.metric] ?? r.metric;
    const key = r.kind === 'loses' ? r.platform : 'target';
    return plan({
      fingerprint: `proof-stat-ratchet-${r.metric.replaceAll('.', '-')}-${key}`,
      title:
        r.kind === 'loses'
          ? `Profile ${name} loses to ${r.platform}: ${fmt(r.jovie)} vs ${fmt(r.them)}`
          : `Profile ${name} misses its target: ${fmt(r.jovie)} vs ${fmt(r.target)}`,
      reason: 'proof-stat-ratchet',
      priority: 2,
      lines: [
        `Weekly Public Profile Benchmark, measured ${ratchetsDoc.measuredAt ?? 'unknown'}: ${ratchetsDoc.runUrl ?? ''}`,
        'Improve the public profile until the next run clears this. The comparison claim stays unpublished while any measured platform is ahead.',
      ],
    });
  });
}

/** Live public stats that went stale: the freshness alarm. */
export function keepTruePlans(feed) {
  return (feed?.stats ?? [])
    .filter(
      stat =>
        stat.state === 'stale' &&
        stat.visibility === 'public' &&
        stat.status === 'live'
    )
    .map(stat =>
      plan({
        fingerprint: `proof-stat-stale-${stat.id}`,
        title: `Proof stat ${stat.id} is stale and hidden`,
        reason: 'proof-stat-stale',
        priority: 2,
        lines: [
          `Last measured ${stat.measuredAt ?? 'never'}. Pages withdrew it automatically; its producer (${stat.sourceKind}) stopped reporting.`,
        ],
      })
    );
}

/**
 * Comparative claims that are measured, fresh and only missing founder
 * approval. Card payloads follow summerCardInputSchema; defaultDecision is
 * `none` so silence never publishes a comparison.
 */
export function approvalRequests(feed, now) {
  return (feed?.stats ?? [])
    .filter(stat => stat.legalClass !== 'plain' && stat.state === 'unapproved')
    .map(stat => ({
      idempotencyKey: `proof-approve-${stat.id}-${String(stat.rawValue)}`.slice(
        0,
        128
      ),
      kind: 'decision',
      product: 'jov',
      title: `Publish comparison: ${stat.label}`.slice(0, 120),
      body: [
        `Measured ${stat.measuredAt}. The claim would read with value ${stat.rawValue}.`,
        `It is literally true for every platform we could measure and reproducible from the weekly benchmark. Method: https://jov.ie${stat.methodology ?? '/proof/methodology'}.`,
        'Approving lets pages show it until a new value needs a new approval.',
      ].join('\n\n'),
      recommendation: 'Approve if you are comfortable naming these platforms.',
      defaultIfSilent: 'Nothing is published.',
      defaultDecision: 'none',
      decideBy: new Date(now + 7 * 24 * 3600 * 1000).toISOString(),
    }));
}

/** Win texts for milestone events newer than `since`. */
export function winTexts(feed, registry, since) {
  const labels = new Map(registry.stats.map(stat => [stat.id, stat.label]));
  return (feed?.events ?? [])
    .filter(e => e.type === 'milestone' && (!since || e.at > since))
    .map(e => ({
      id: e.id,
      text: `${labels.get(e.statId) ?? e.statId} just passed ${fmt(e.value)}.`,
    }));
}

/**
 * One loop pass. `loadFeed`/`loadRatchets`/`loadClaims` may throw; a failed
 * read is a warning and the stages that need it are skipped, never guessed.
 */
export async function runProofLoop({
  root,
  loadFeed,
  loadRatchets,
  loadClaimsMeasurement,
  since = null,
  now = Date.now,
}) {
  const registry = loadRegistry(root);
  const stages = [];
  const warnings = [];
  const stage = async (name, fn) => {
    const startedAt = new Date(now()).toISOString();
    try {
      const value = await fn();
      stages.push({
        name,
        startedAt,
        endedAt: new Date(now()).toISOString(),
        ok: true,
      });
      return value;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      stages.push({
        name,
        startedAt,
        endedAt: new Date(now()).toISOString(),
        ok: false,
        reason,
      });
      warnings.push(`proof loop ${name} unavailable: ${reason}`);
      return null;
    }
  };

  const feed = await stage('feed', () => loadFeed());
  const ratchetsDoc = await stage('ratchets', () => loadRatchets());
  const claims = await stage('claims-measurement', () =>
    loadClaimsMeasurement()
  );
  const ideas = await stage('ideate', () => ideate(registry));
  const establish = await stage('establish', () =>
    establishPlans(registry, feed)
  );
  const ratchet = await stage('ratchet', () => ratchetPlans(ratchetsDoc));
  const keepTrue = await stage('keep-true', () =>
    feed ? keepTruePlans(feed) : []
  );
  const approvals = await stage('publish', () =>
    feed ? approvalRequests(feed, now()) : []
  );
  const wins = await stage('wins', () =>
    feed ? winTexts(feed, registry, since) : []
  );

  const plans = [...(establish ?? []), ...(ratchet ?? []), ...(keepTrue ?? [])];
  const run = {
    schema: 'jovie.proof-loop-run/v1',
    at: new Date(now()).toISOString(),
    stages,
    metrics: {
      statsTotal: registry.stats.length,
      published: feed?.metrics?.published ?? null,
      stale: feed?.metrics?.stale ?? null,
      belowThreshold: feed?.metrics?.belowThreshold ?? null,
      unapproved: feed?.metrics?.unapproved ?? null,
      numericClaims: claims?.numericClaims ?? null,
      statBoundShare: claims?.boundShare ?? null,
      plans: plans.length,
      approvalRequests: approvals?.length ?? 0,
      winTexts: wins?.length ?? 0,
    },
    ideas: (ideas ?? []).slice(0, 10),
    approvals: approvals ?? [],
    wins: wins ?? [],
  };
  return { run, plans, warnings };
}
