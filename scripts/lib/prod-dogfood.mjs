// Production dogfood agent core: mission registry, receipts, certification
// roll-up and finding shaping. Pure; checks live in prod-dogfood-checks.mjs.
//
// A "mission" is one outcome a real visitor needs (the same ids as the
// outcome missions in apps/web/lib/canonical-surfaces.ts and the assurance
// matrix). A mission is certified only when every check passed on production,
// bound to the exact deployed commit. Anything unverified or blocked is
// uncertified, never silently green.
import { createHash } from 'node:crypto';

export const RECEIPT_SCHEMA = 'jovie.dogfood-receipt/v1';
export const CERTIFICATION_SCHEMA = 'jovie.prod-dogfood-certification/v1';

/** Linear priority numbers (1 urgent .. 4 low) per severity. */
export const SEVERITY = {
  P0: { priority: 1, label: 'P0' },
  P1: { priority: 2, label: 'P1' },
  P2: { priority: 3, label: 'P2' },
  P3: { priority: 4, label: 'P3' },
};

export function sha8(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

/** Stable dedup key: mission + check + target. Matches the remediation key regex. */
export function fingerprintFor({ mission, check, target }) {
  const slug = s =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `dogfood-${slug(String(mission).replace(/^dogfood:/, ''))}-${slug(check)}-${sha8(target)}`.slice(
    0,
    70
  );
}

/** Invariant/regression-check proposal per defect class (filed with each issue). */
export const INVARIANT_PROPOSALS = {
  'inbound-link-resolves':
    'Invariant: every jov.ie URL a creator has published off-platform (YouTube/Instagram/bio links) resolves 200, is not a "Coming soon" shell, and lands on a page whose title matches the slug. Enforced by the production dogfood agent on every deploy; the fix PR should add a slug-history redirect (content_slug_redirects) and a slug-claim test so a renamed or collided slug never orphans a published URL.',
  'release-page-resolves':
    'Invariant: every release listed in the profile JSON-LD resolves 200 with a canonical equal to its own URL and is not a "Coming soon" shell.',
  'release-has-destinations':
    'Invariant: every public release page exposes at least one working streaming destination.',
  'profile-identity':
    'Invariant: the public profile JSON-LD sameAs carries the verified Spotify and Apple artist ids for the artist.',
  'profile-has-releases':
    'Invariant: a profile whose catalog is imported lists its releases in JSON-LD and on the page.',
  'surface-renders':
    'Invariant: each public marketing/auth surface returns 200 with its identifying content and no error shell.',
  'rendered-clean':
    'Invariant: rendered public pages produce no page errors, no same-origin 4xx/5xx, no broken images and no horizontal overflow at phone and desktop widths.',
  'destination-link-live':
    'Invariant: outbound destination links (DSPs/socials) return a non-error status; identity ids on the profile match the verified artist.',
  'sitemap-url-healthy':
    'Invariant: every URL in sitemap.xml returns 200, is indexable, and is self-canonical; a sitemap entry that 404s, redirects away or points at a noindex placeholder is a defect.',
  'share-image-resolves':
    'Invariant: every public profile and release page advertises an og:image that returns 200 with an image content type.',
  'profile-interactions':
    'Invariant: the public profile tabs (Home, Music, Events, About) change the view, and Get Updates opens an email capture, with no page errors.',
  'dashboard-page-clean':
    'Invariant: every signed-in dashboard page (home, audience, releases, library, earnings, insights) loads for the sanctioned creator identity with content, no page errors and no same-origin 4xx/5xx, at desktop and phone widths.',
  'chat-surface-ready':
    'Invariant: the signed-in chat surface renders its conversation area and an enabled composer with no page errors or same-origin 4xx/5xx.',
  'auth-signin':
    'Invariant: the sanctioned production identity can sign in through the rendered email-code flow on every deploy.',
  'vision-review':
    'Invariant: a vision review of each page screenshot finds no broken layout, clipped text, missing images, error states or placeholder copy; the deterministic check that would have caught this specific defect should be added with the fix.',
  'build-binding':
    'Invariant: /api/health/build-info exposes a full commitSha and deploymentId so every receipt binds to the exact deploy.',
};

/**
 * The mission registry. `automation: 'implemented'` missions run on every
 * pass; `blocked` missions are listed so uncertified features stay visible
 * with an owner and an unblock condition instead of vanishing.
 */
export const MISSIONS = [
  {
    id: 'dogfood:public-profile',
    subjectId: 'public-profile',
    product: 'jov',
    title:
      'Fan opens an artist profile and sees verified identity and releases',
    checks: ['profile-identity', 'profile-has-releases', 'build-binding'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:release-landing',
    subjectId: 'release-landing',
    product: 'jov',
    title:
      'Fan opens every release page and reaches a working streaming destination',
    checks: [
      'release-page-resolves',
      'release-has-destinations',
      'destination-link-live',
      'share-image-resolves',
    ],
    automation: 'implemented',
  },
  {
    id: 'dogfood:published-links',
    subjectId: 'journey:artist-profile-public',
    product: 'jov',
    title:
      'A link the artist published off-platform lands on the right release',
    checks: ['inbound-link-resolves'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:public-surfaces',
    subjectId: 'homepage',
    product: 'jov',
    title:
      'Visitor reaches the homepage, pricing, sign-in, sign-up and crawl files',
    checks: ['surface-renders'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:sitemap-integrity',
    subjectId: 'homepage',
    product: 'jov',
    title: 'Every URL the sitemap advertises is a healthy, indexable page',
    checks: ['sitemap-url-healthy'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:profile-interactions',
    subjectId: 'public-profile',
    product: 'jov',
    title: 'Fan switches profile tabs and opens Get Updates without errors',
    checks: ['profile-interactions'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:rendered-public-ui',
    subjectId: 'journey:artist-profile-public',
    product: 'jov',
    title:
      'Profile and release pages render cleanly at phone and desktop widths',
    checks: ['rendered-clean'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:signup-onboarding',
    subjectId: 'journey:signup-onboarding',
    product: 'jov',
    title: 'New artist signs up, claims a handle and reaches a live profile',
    checks: [],
    automation: 'blocked',
    blocker:
      'fresh-user signup creates real accounts; covered today by synthetic-monitoring (signup canary + Layer A) which is not SHA-bound. Needs E2E_PROD_SIGNUP_EMAIL_BASE mailbox flow wired into a SHA-bound receipt, or JOV-8809 robot auth path',
    owner: 'auth lane',
  },
  {
    id: 'dogfood:dashboard',
    subjectId: 'dashboard-releases',
    product: 'jov',
    title: 'Artist opens the dashboard and sees real releases and audience',
    checks: ['dashboard-page-clean', 'auth-signin'],
    automation: 'implemented',
    blocker:
      'sanctioned creator-ready sign-in (E2E_PROD_USER_EMAIL + DATABASE_URL via Doppler jovie-web/prd) did not complete',
  },
  {
    id: 'dogfood:chat',
    subjectId: 'journey:chat-agent-turn',
    product: 'jov',
    title: 'Artist opens chat and the composer is ready (no message is sent)',
    checks: ['chat-surface-ready', 'auth-signin'],
    automation: 'implemented',
    blocker:
      'sanctioned creator-ready sign-in did not complete; a grounded-answer turn needs the synthetic-chat-turn spend cap',
  },
  {
    id: 'dogfood:fan-subscribe',
    subjectId: 'dashboard-audience',
    product: 'jov',
    title: 'Fan subscribes on a profile and the contact persists',
    checks: [],
    automation: 'blocked',
    blocker:
      'write path with no sanctioned fixture: needs a non-Tim synthetic profile, a synthetic-audience marker (scripts synthetic-audience-markers.ts) and a cleanup job',
    owner: 'audience lane',
  },
  {
    id: 'dogfood:ovie-admin',
    subjectId: 'ovie-admin',
    product: 'ovie',
    title:
      'Founder opens the Ovie admin views and each shows current, internally consistent data',
    checks: [],
    automation: 'blocked',
    blocker:
      'no sanctioned admin identity: resolveProductionAuthCredentials() only accepts the creator-ready email. Needs secret E2E_PROD_ADMIN_USER_EMAIL (seeded browse-admin identity as admin in production) in Doppler jovie-web/prd plus allowing it in production-auth-credentials.ts',
    owner: 'ovie stream',
  },
  {
    id: 'dogfood:lyb-web-public',
    subjectId: 'lyb-core-flows',
    product: 'lyb',
    title:
      'Visitor reaches the LogYourBody public site, sign-in, support and crawl files',
    checks: ['surface-renders'],
    automation: 'implemented',
  },
  {
    id: 'dogfood:lyb-core',
    subjectId: 'lyb-core-flows',
    product: 'lyb',
    title: 'LogYourBody user logs a weigh-in and sees it in the timeline',
    checks: [],
    automation: 'blocked',
    blocker:
      'LYB is iOS-first with Apple sign-in through Jovie OIDC; it has no production web test account or synthetic workflow. Needs an iOS simulator/device driver with a test Apple ID and a seeded LYB production test user',
    owner: 'lyb lane',
  },
];

/** Unverified results of these checks never block certification. */
const ADVISORY_CHECKS = new Set(['destination-link-live', 'vision-review']);

function outcomeOf(checks, mission) {
  if (mission.automation === 'blocked') return 'blocked';
  if (checks.length === 0) return 'blocked';
  if (checks.some(c => c.status === 'failed')) return 'failed';
  if (checks.some(c => c.status === 'unverified' && !ADVISORY_CHECKS.has(c.id)))
    return 'blocked';
  return 'passed';
}

/**
 * One `jovie.dogfood-receipt/v1` per mission run, bound to the deployed
 * commit and deployment. The driver is Playwright (request context + browser).
 */
export function buildReceipt({
  mission,
  checks,
  binding,
  startedAt,
  completedAt,
  evidenceRefs,
  actor = 'prod-dogfood-agent',
  flagCohort = 'public',
}) {
  const outcome = outcomeOf(checks, mission);
  const failed = checks.filter(c => c.status === 'failed');
  let blocker = null;
  if (mission.automation === 'blocked') blocker = mission.blocker;
  else if (outcome === 'failed')
    blocker = `${failed.length} failed check(s): ${[...new Set(failed.map(c => c.id))].join(', ')}`;
  else if (outcome === 'blocked') blocker = 'a required check was unverified';
  return {
    schema: RECEIPT_SCHEMA,
    subjectId: mission.subjectId,
    product: mission.product,
    kind: 'ui_agent',
    driver: 'playwright',
    missionId: mission.id,
    actor,
    environment: 'production',
    deploymentId: binding.deploymentId,
    commitSha: binding.commitSha,
    flagCohort,
    startedAt,
    completedAt,
    outcome,
    blocker,
    evidenceRefs: evidenceRefs?.length
      ? evidenceRefs
      : [`checks:${mission.id}`],
    invocation: null,
    privacy: {
      conversationContentRetained: false,
      credentialsRetained: false,
      accountIdentityRetained: false,
      unrelatedPersonalDataRetained: false,
    },
  };
}

/**
 * Certification roll-up. A mission is `certified` only on a passed receipt
 * whose commit equals the deploy still being served (`servedSha`).
 */
export function certificationState({
  receipts,
  servedSha,
  generatedAt,
  previous = {},
}) {
  const missions = MISSIONS.map(m => {
    const r = receipts.find(x => x.missionId === m.id);
    const prev = previous[m.id] ?? null;
    let status;
    if (!r || m.automation === 'blocked') status = 'uncertified:blocked';
    else if (r.outcome === 'passed' && r.commitSha === servedSha)
      status = 'certified';
    else if (r.outcome === 'passed') status = 'uncertified:stale-sha';
    else if (r.outcome === 'failed') status = 'failing';
    else status = 'uncertified:blocked';
    return {
      missionId: m.id,
      subjectId: m.subjectId,
      product: m.product,
      title: m.title,
      status,
      commitSha: r?.commitSha ?? null,
      deploymentId: r?.deploymentId ?? null,
      completedAt: r?.completedAt ?? null,
      blocker:
        status === 'certified' ? null : (r?.blocker ?? m.blocker ?? null),
      owner: m.owner ?? null,
      lastCertifiedSha:
        status === 'certified' ? r.commitSha : (prev?.lastCertifiedSha ?? null),
    };
  });
  return {
    schema: CERTIFICATION_SCHEMA,
    generatedAt,
    servedSha,
    certified: missions.filter(m => m.status === 'certified').length,
    total: missions.length,
    missions,
  };
}

const NEXT_STEP = {
  'inbound-link-resolves':
    'Fix the slug resolution (redirect/alias for the published slug) so the URL the artist already published lands on the correct release.',
  'release-page-resolves':
    'Restore or republish the release page; check the release row status and slug.',
  'surface-renders':
    'Restore the surface; check the latest deploy and error logs.',
};

/** Linear issue body for one failed check: evidence, expectation, owner, invariant. */
export function findingIssue({
  check,
  mission,
  binding,
  runUrl,
  artifactNote,
}) {
  const fp = fingerprintFor({
    mission: mission.id,
    check: check.id,
    target: check.target,
  });
  const sev = SEVERITY[check.severity] ?? SEVERITY.P2;
  const lines = [
    '## Found by the production dogfood agent (before a human did)',
    '',
    `- Mission: ${mission.id} (${mission.title})`,
    `- Severity: ${sev.label}`,
    `- URL: ${check.url ?? check.target}`,
    ...(check.source ? [`- Published at: ${check.source}`] : []),
    `- Served build: ${binding.commitSha} (${binding.deploymentId})`,
    `- Run: ${runUrl || 'local run'}`,
    ...(artifactNote ? [`- Evidence: ${artifactNote}`] : []),
    '',
    '## Expected',
    check.expected ?? '',
    '',
    '## Actual',
    check.actual ?? check.summary,
    '',
    '## Next step',
    NEXT_STEP[check.id] ??
      'Reproduce with the URL above, fix on the normal path.',
    '',
    '## Invariant / regression check to add with the fix',
    INVARIANT_PROPOSALS[check.id] ??
      'Add a deterministic production check for this defect class to the dogfood agent.',
    '',
    'This issue closes itself when the dogfood agent next verifies the check passing on production.',
    '',
    `Fingerprint: ${fp}`,
  ];
  return {
    fingerprint: fp,
    title: `[${fp}] ${check.summary} (${(() => {
      try {
        return new URL(check.url ?? check.target).pathname;
      } catch {
        return check.target;
      }
    })()})`,
    description: lines.join('\n'),
    priority: sev.priority,
  };
}

/** Weekly Tim-found vs agent-found counts from {createdAt, labels[]} rows. */
export function weeklyDefectMetrics(
  issues,
  { now = new Date(), weeks = 5 } = {}
) {
  const startOfWeek = d => {
    const x = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    );
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  const rows = new Map();
  for (let i = 0; i < weeks; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    rows.set(startOfWeek(d), {
      week: startOfWeek(d),
      agentFound: 0,
      timFound: 0,
    });
  }
  for (const issue of issues) {
    const week = startOfWeek(new Date(issue.createdAt));
    const row = rows.get(week);
    if (!row) continue;
    const labels = issue.labels ?? [];
    if (labels.includes('dogfood-agent')) row.agentFound++;
    else if (labels.includes('escaped-defect')) row.timFound++;
  }
  return [...rows.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(r => ({
      ...r,
      agentShare:
        r.agentFound + r.timFound === 0
          ? null
          : Number((r.agentFound / (r.agentFound + r.timFound)).toFixed(2)),
    }));
}
