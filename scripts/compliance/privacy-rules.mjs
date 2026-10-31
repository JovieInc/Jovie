// Privacy rules check (compliance loop, stage 2).
//
// Pure functions over a privacy-inventory snapshot and the tracker registry.
// Each rule encodes one line of gbrain
// decisions/company/privacy-tracking-compliance-guidelines-2026-10-31.
// Every rule has a seeded-violation negative control (runControls); a run
// whose controls do not all fail is itself a failure, so a rule that stops
// biting is caught the same day.

export const BANNED_ON_INPUT = new Set([
  'pixel',
  'analytics',
  'replay',
  'chat-widget',
  'ads',
]);
export const OPT_OUT_CATEGORIES = new Set(['pixel', 'ads', 'replay']);
const SENSITIVE_INPUTS = new Set([
  'password',
  'email',
  'tel',
  'freeform',
  'payment',
  'text',
]);

export const RULES = {
  'registered-third-parties':
    'Every third-party host a page loads is in canon/privacy/tracker-registry.json.',
  'no-tracker-on-input-page':
    'No third-party pixel, analytics, replay, chat widget or ads on pages where people type.',
  'do-not-sell-link':
    'Pages of a product that runs pixels show a "Do Not Sell or Share" link.',
  'gpc-honored':
    'With GPC on, no pixel, ads or replay fires and the page confirms GPC was honored.',
  'eu-consent-first':
    'EU/UK visitors see a consent bar with equal Accept and Reject; nothing non-essential fires first.',
  'no-prechecked-boxes':
    'No checkbox or switch is checked before the visitor touches it.',
  'claims-truthful':
    'Policies make no banned claim and name every pixel, analytics or replay vendor we load.',
  'minors-pixels-off':
    'Young-audience surfaces load no pixel, ads or replay; at least one such surface is crawled.',
};

function hostMatches(host, patterns) {
  return patterns.some(p => host === p || host.endsWith(`.${p}`));
}

export function vendorFor(host, registry) {
  return registry.vendors.find(v => hostMatches(host, v.hosts ?? [])) ?? null;
}

function hostsWith(page, registry, categories, phase = 'load') {
  return (page.third_party_requests ?? [])
    .filter(r => r.phase === phase)
    .map(r => ({ host: r.host, vendor: vendorFor(r.host, registry) }))
    .filter(r => r.vendor && categories.has(r.vendor.category));
}

export function isInputPage(page) {
  return (
    (page.declared_inputs ?? []).length > 0 ||
    (page.input_kinds ?? []).some(k => SENSITIVE_INPUTS.has(k))
  );
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** Banned-claim hits and named vendors for one policy document. */
export function analyzePolicy(html, registry) {
  const text = htmlToText(html);
  const banned_claim_hits = [];
  for (const source of registry.banned_claims ?? []) {
    const m = new RegExp(source, 'i').exec(text);
    if (m) {
      banned_claim_hits.push({
        pattern: source,
        excerpt: text
          .slice(Math.max(0, m.index - 60), m.index + m[0].length + 60)
          .trim(),
      });
    }
  }
  const named_vendors = registry.vendors
    .filter(v =>
      (v.policy_names ?? []).some(n => new RegExp(`\\b${n}\\b`, 'i').test(text))
    )
    .map(v => v.id);
  return { banned_claim_hits, named_vendors };
}

function result(rule, status, page, detail) {
  return {
    rule,
    status,
    surface: page?.surface ?? null,
    scenario: page?.scenario ?? null,
    detail,
  };
}

function productsRunningPixels(snapshot, registry) {
  const out = new Set();
  for (const page of snapshot.pages) {
    if (page.scenario !== 'us-default') continue;
    if (hostsWith(page, registry, OPT_OUT_CATEGORIES).length)
      out.add(page.product);
  }
  return out;
}

export function evaluate(snapshot, registry) {
  const results = [];
  const pixelProducts = productsRunningPixels(snapshot, registry);
  const ok = snapshot.pages.filter(p => !p.error);

  for (const page of snapshot.pages) {
    if (page.error)
      results.push(result('crawl', 'warn', page, `crawl error: ${page.error}`));
  }

  for (const page of ok) {
    const unknown = (page.third_party_requests ?? [])
      .filter(r => !vendorFor(r.host, registry))
      .map(r => r.host);
    results.push(
      unknown.length
        ? result(
            'registered-third-parties',
            'fail',
            page,
            `unregistered hosts: ${[...new Set(unknown)].join(', ')}`
          )
        : result('registered-third-parties', 'pass', page, '')
    );
  }

  // Consent does not lift this rule: check default load and after Accept.
  for (const page of ok.filter(
    p =>
      (p.scenario === 'us-default' || p.scenario === 'eu-accept') &&
      isInputPage(p)
  )) {
    const phase = page.scenario === 'eu-accept' ? 'after-accept' : 'load';
    const hits = hostsWith(page, registry, BANNED_ON_INPUT, phase).filter(
      h => !h.vendor.allowed_on_input_pages
    );
    results.push(
      hits.length
        ? result(
            'no-tracker-on-input-page',
            'fail',
            page,
            `inputs [${[...(page.input_kinds ?? []), ...(page.declared_inputs ?? [])].join(', ')}] with ${hits.map(h => `${h.vendor.id} (${h.host})`).join(', ')}`
          )
        : result('no-tracker-on-input-page', 'pass', page, '')
    );
  }

  for (const page of ok.filter(
    p => p.scenario === 'us-default' && pixelProducts.has(p.product)
  )) {
    results.push(
      page.dns_link
        ? result('do-not-sell-link', 'pass', page, page.dns_link.text)
        : result(
            'do-not-sell-link',
            'fail',
            page,
            'product runs pixels but this page has no Do Not Sell or Share link'
          )
    );
  }

  for (const page of ok.filter(p => p.scenario === 'us-gpc')) {
    const hits = hostsWith(page, registry, OPT_OUT_CATEGORIES);
    if (hits.length) {
      results.push(
        result(
          'gpc-honored',
          'fail',
          page,
          `fired with GPC on: ${hits.map(h => h.host).join(', ')}`
        )
      );
    } else if (pixelProducts.has(page.product) && !page.gpc_confirmation) {
      results.push(
        result(
          'gpc-honored',
          'fail',
          page,
          'no pixel fired, but no visible confirmation that GPC was honored'
        )
      );
    } else {
      results.push(result('gpc-honored', 'pass', page, ''));
    }
  }

  for (const page of ok.filter(p => p.scenario === 'eu')) {
    const hits = hostsWith(page, registry, BANNED_ON_INPUT);
    const banner = page.consent_banner ?? {};
    const problems = [];
    if (hits.length)
      problems.push(
        `fired before consent: ${hits.map(h => h.host).join(', ')}`
      );
    // A bar is owed only where something consent-gated would otherwise run:
    // the same surface fires a pixel/analytics host for a default US visitor.
    const usDefault = ok.find(
      p => p.scenario === 'us-default' && p.surface === page.surface
    );
    const gated = usDefault
      ? hostsWith(usDefault, registry, BANNED_ON_INPUT).length > 0
      : true;
    if (!banner.visible && gated) problems.push('no consent bar shown');
    else if (banner.visible && !(banner.reject >= 1 && banner.accept >= 1))
      problems.push(`accept ${banner.accept} vs reject ${banner.reject}`);
    results.push(
      result(
        'eu-consent-first',
        problems.length ? 'fail' : 'pass',
        page,
        problems.join('; ')
      )
    );
  }
  // Positive control: on a surface where the US scenario fires a pixel, the
  // pixel must fire after Accept, or the eu "nothing fired" pass is vacuous.
  for (const page of ok.filter(p => p.scenario === 'eu-accept')) {
    const us = ok.find(
      p => p.scenario === 'us-default' && p.surface === page.surface
    );
    if (!us || !hostsWith(us, registry, OPT_OUT_CATEGORIES).length) continue;
    const fired =
      hostsWith(page, registry, OPT_OUT_CATEGORIES, 'after-accept').length > 0;
    results.push(
      result(
        'eu-consent-first',
        fired ? 'pass' : 'warn',
        page,
        fired
          ? 'positive control: pixel fired after Accept'
          : 'positive control inconclusive: pixel did not fire after Accept'
      )
    );
  }

  for (const page of ok.filter(p => p.scenario === 'us-default')) {
    const pre = page.prechecked ?? [];
    results.push(
      pre.length
        ? result(
            'no-prechecked-boxes',
            'fail',
            page,
            `pre-checked: ${pre.join(' | ')}`
          )
        : result('no-prechecked-boxes', 'pass', page, '')
    );
  }

  const observedByProduct = new Map();
  for (const page of ok) {
    for (const h of hostsWith(
      page,
      registry,
      new Set(['pixel', 'analytics', 'replay', 'ads', 'chat-widget'])
    )) {
      const set = observedByProduct.get(page.product) ?? new Set();
      set.add(h.vendor.id);
      observedByProduct.set(page.product, set);
    }
  }
  for (const [id, policy] of Object.entries(snapshot.policy_versions ?? {})) {
    if (policy.error || !policy.analysis) {
      results.push(
        result(
          'claims-truthful',
          'warn',
          { surface: id },
          `policy not analysed: ${policy.error ?? 'missing'}`
        )
      );
      continue;
    }
    for (const hit of policy.analysis.banned_claim_hits) {
      results.push(
        result(
          'claims-truthful',
          'fail',
          { surface: id },
          `banned claim /${hit.pattern}/: "${hit.excerpt}"`
        )
      );
    }
  }
  for (const [product, vendors] of observedByProduct) {
    const policies = Object.entries(snapshot.policy_versions ?? {}).filter(
      ([id, p]) => id.startsWith(`${product}-`) && p.analysis
    );
    if (!policies.length) continue;
    const named = new Set(
      policies.flatMap(([, p]) => p.analysis.named_vendors)
    );
    const missing = [...vendors].filter(v => !named.has(v));
    results.push(
      missing.length
        ? result(
            'claims-truthful',
            'fail',
            { surface: `${product}-policies` },
            `loaded but not named in policy: ${missing.join(', ')}`
          )
        : result(
            'claims-truthful',
            'pass',
            { surface: `${product}-policies` },
            ''
          )
    );
  }

  for (const product of pixelProducts) {
    const young = ok.filter(p => p.product === product && p.young_audience);
    if (!young.length) {
      results.push(
        result(
          'minors-pixels-off',
          'warn',
          { surface: product },
          'product runs pixels but no young-audience surface is crawled; minors control unverified'
        )
      );
    }
    for (const page of young) {
      const hits = hostsWith(page, registry, OPT_OUT_CATEGORIES);
      results.push(
        result(
          'minors-pixels-off',
          hits.length ? 'fail' : 'pass',
          page,
          hits.length
            ? `young-audience page fired ${hits.map(h => h.host).join(', ')}`
            : ''
        )
      );
    }
  }

  return results;
}

export function summarize(results) {
  const byRule = {};
  for (const r of results) {
    byRule[r.rule] ??= { pass: 0, fail: 0, warn: 0 };
    byRule[r.rule][r.status] += 1;
  }
  return {
    pass: results.filter(r => r.status === 'pass').length,
    fail: results.filter(r => r.status === 'fail').length,
    warn: results.filter(r => r.status === 'warn').length,
    by_rule: byRule,
  };
}

// ---------------------------------------------------------------------------
// Negative controls: a clean synthetic snapshot plus one seeded violation per
// rule. Each seeded snapshot must produce a fail for exactly its rule.

export const CONTROL_REGISTRY = {
  first_party_domains: ['example.test'],
  banned_claims: ["we (do not|don't|never) track"],
  vendors: [
    {
      id: 'meta',
      category: 'pixel',
      hosts: ['facebook.net', 'facebook.com'],
      policy_names: ['Meta'],
    },
    { id: 'cdn', category: 'content', hosts: ['cdn.test'] },
    {
      id: 'stripe',
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

export function runControls(evaluateFn = evaluate) {
  const outcomes = [];
  const clean = evaluateFn(cleanControlSnapshot(), CONTROL_REGISTRY);
  const cleanFails = clean.filter(r => r.status === 'fail');
  outcomes.push({
    control: 'clean',
    ok: cleanFails.length === 0,
    detail: cleanFails.map(r => r.rule).join(', '),
  });
  for (const rule of Object.keys(RULES)) {
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
  return outcomes;
}
