import { runControls as runPrivacyControls } from './privacy-controls.mjs';

export { CONTROL_REGISTRY, cleanControlSnapshot } from './privacy-controls.mjs';

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
    'Every third-party host a page loads has live approval in canon/privacy/tracker-registry.json.',
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
  // A run that crawled nothing proves nothing: fail it instead of passing on
  // an empty set of rules.
  if (snapshot.pages.length === 0 || ok.length === 0) {
    results.push(
      result(
        'crawl',
        'fail',
        { surface: 'all' },
        `no page was crawled successfully (${snapshot.pages.length} attempted)`
      )
    );
  }

  for (const page of ok) {
    const unknown = (page.third_party_requests ?? [])
      .filter(r => vendorFor(r.host, registry)?.status !== 'live')
      .map(r => r.host);
    results.push(
      unknown.length
        ? result(
            'registered-third-parties',
            'fail',
            page,
            `unregistered or inactive hosts: ${[...new Set(unknown)].join(', ')}`
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
  const policyEntries = Object.entries(snapshot.policy_versions ?? {});
  if (
    policyEntries.length > 0 &&
    policyEntries.every(([, p]) => p.error || !p.analysis)
  ) {
    results.push(
      result(
        'claims-truthful',
        'fail',
        { surface: 'all-policies' },
        'no policy page could be analysed, so no claim was checked'
      )
    );
  }
  for (const [id, policy] of policyEntries) {
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

export function runControls(evaluateFn = evaluate) {
  return runPrivacyControls(evaluateFn, RULES);
}
