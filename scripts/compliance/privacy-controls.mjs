// ---------------------------------------------------------------------------
// Negative controls: a clean synthetic snapshot plus one seeded violation per
// rule. Each seeded snapshot must produce a fail for exactly its rule.

export const CONTROL_REGISTRY = {
  first_party_domains: ['example.test'],
  banned_claims: ["we (do not|don't|never) track"],
  vendors: [
    {
      id: 'meta',
      status: 'live',
      category: 'pixel',
      hosts: ['facebook.net', 'facebook.com'],
      policy_names: ['Meta'],
    },
    { id: 'cdn', status: 'live', category: 'content', hosts: ['cdn.test'] },
    {
      id: 'stripe',
      status: 'live',
      category: 'processor',
      hosts: ['stripe.com'],
      allowed_on_input_pages: true,
    },
  ],
};

function page(overrides) {
  return {
    surface: 'home',
    product: 'p',
    scenario: 'us-default',
    declared_inputs: [],
    input_kinds: [],
    prechecked: [],
    dns_link: { text: 'Do Not Sell or Share My Personal Information' },
    consent_banner: { visible: false, accept: 0, reject: 0 },
    gpc_confirmation: false,
    young_audience: false,
    third_party_requests: [],
    ...overrides,
  };
}

export function cleanControlSnapshot() {
  const pixel = [{ host: 'connect.facebook.net', phase: 'load', count: 1 }];
  return {
    policy_versions: {
      'p-privacy': {
        analysis: { banned_claim_hits: [], named_vendors: ['meta'] },
      },
    },
    pages: [
      page({
        third_party_requests: [
          ...pixel,
          { host: 'cdn.test', phase: 'load', count: 1 },
        ],
      }),
      page({
        surface: 'signup',
        declared_inputs: ['auth'],
        input_kinds: ['email', 'password'],
        third_party_requests: [
          { host: 'js.stripe.com', phase: 'load', count: 1 },
        ],
      }),
      page({ scenario: 'us-gpc', gpc_confirmation: true }),
      page({
        scenario: 'eu',
        consent_banner: { visible: true, accept: 1, reject: 1 },
      }),
      page({
        scenario: 'eu-accept',
        third_party_requests: [
          { host: 'connect.facebook.net', phase: 'after-accept', count: 1 },
        ],
      }),
      page({ surface: 'kids', young_audience: true }),
    ],
  };
}

const SEEDS = {
  'registered-third-parties': s => {
    s.pages[0].third_party_requests.push({
      host: 'mystery.tracker.test',
      phase: 'load',
      count: 1,
    });
  },
  'no-tracker-on-input-page': s => {
    // Consented visitor on an input page: Accept must not unlock the pixel.
    s.pages.push(
      page({
        surface: 'signup',
        scenario: 'eu-accept',
        declared_inputs: ['auth'],
        third_party_requests: [
          { host: 'connect.facebook.net', phase: 'after-accept', count: 1 },
        ],
      })
    );
  },
  'do-not-sell-link': s => {
    s.pages[0].dns_link = null;
  },
  'gpc-honored': s => {
    s.pages[2].third_party_requests.push({
      host: 'connect.facebook.net',
      phase: 'load',
      count: 1,
    });
  },
  'eu-consent-first': s => {
    s.pages[3].third_party_requests.push({
      host: 'connect.facebook.net',
      phase: 'load',
      count: 1,
    });
  },
  'no-prechecked-boxes': s => {
    s.pages[1].prechecked = ['Send me marketing email'];
  },
  'claims-truthful': s => {
    s.policy_versions['p-privacy'].analysis.banned_claim_hits.push({
      pattern: 'we never track',
      excerpt: 'we never track you',
    });
  },
  'minors-pixels-off': s => {
    s.pages[5].third_party_requests.push({
      host: 'connect.facebook.net',
      phase: 'load',
      count: 1,
    });
  },
};

export function runControls(evaluateFn, rules) {
  const outcomes = [];
  const clean = evaluateFn(cleanControlSnapshot(), CONTROL_REGISTRY);
  const cleanFails = clean.filter(r => r.status === 'fail');
  outcomes.push({
    control: 'clean',
    ok: cleanFails.length === 0,
    detail: cleanFails.map(r => r.rule).join(', '),
  });
  for (const rule of Object.keys(rules)) {
    const seeded = cleanControlSnapshot();
    SEEDS[rule](seeded);
    const fails = evaluateFn(seeded, CONTROL_REGISTRY).filter(
      r => r.status === 'fail'
    );
    const ok = fails.length > 0 && fails.every(r => r.rule === rule);
    outcomes.push({
      control: rule,
      ok,
      detail: fails.map(r => r.rule).join(', ') || 'seeded violation passed',
    });
  }
  const inactiveRegistry = structuredClone(CONTROL_REGISTRY);
  inactiveRegistry.vendors.find(v => v.id === 'cdn').status = 'inactive';
  const inactiveFails = evaluateFn(
    cleanControlSnapshot(),
    inactiveRegistry
  ).filter(r => r.status === 'fail');
  outcomes.push({
    control: 'inactive-vendor',
    ok:
      inactiveFails.length > 0 &&
      inactiveFails.every(r => r.rule === 'registered-third-parties'),
    detail:
      inactiveFails.map(r => r.rule).join(', ') ||
      'inactive vendor request passed',
  });
  return outcomes;
}
