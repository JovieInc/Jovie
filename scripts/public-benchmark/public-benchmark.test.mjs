import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AGENT_CHECKS,
  agentScore,
  anonymizeReceipt,
  contentChecks,
  evaluateClaim,
  extractRawSignals,
  outboundHosts,
  parseRobots,
  quantile,
  robotsAllows,
  runGate,
  summarize,
  validateTargets,
} from './public-benchmark.mjs';

const claimsDoc = JSON.parse(
  readFileSync(new URL('./claims.json', import.meta.url), 'utf8')
);

/** @param {string} id @param {number | null} lcp @param {number | null} score */
function platform(id, lcp, score) {
  return {
    id,
    profiles: [
      {
        id: `${id}-1`,
        url: `https://${id}.example/artist`,
        finalUrl: `https://${id}.example/artist`,
        speed: { lcp: { median: lcp } },
        agent: { score, renderedHosts: ['a.example'], rawHosts: [] },
      },
    ],
  };
}

/** @param {any[]} platforms */
function receipt(platforms) {
  return { schema: 'jovie.public-benchmark/v1', platforms };
}

/** @type {{ id: string, metric: string, better: 'lower' | 'higher' }} */
const lcpClaim = { id: 'lcp', metric: 'speed.lcp.median', better: 'lower' };

test('quantile and summarize use linear interpolation and need 3 valid runs', () => {
  assert.equal(quantile([4, 1, 3, 2], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.75), 4);
  assert.deepEqual(summarize([1, Number.NaN, 2]), {
    n: 2,
    median: null,
    p75: null,
    min: null,
    max: null,
  });
  assert.equal(summarize([5, 1, 3]).median, 3);
});

test('robots: specific group beats *, longest match wins, allow wins ties', () => {
  const groups = parseRobots(
    [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: GPTBot',
      'User-agent: ClaudeBot',
      'Disallow: /admin',
      'Allow: /admin/public$',
    ].join('\n')
  );
  assert.equal(robotsAllows(groups, 'JovieBench', '/artist'), false);
  assert.equal(robotsAllows(groups, 'ClaudeBot', '/artist'), true);
  assert.equal(robotsAllows(groups, 'gptbot', '/admin/x'), false);
  assert.equal(robotsAllows(groups, 'GPTBot', '/admin/public'), true);
  assert.equal(robotsAllows(parseRobots(''), 'JovieBench', '/x'), true);
  const tie = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a');
  assert.equal(robotsAllows(tie, 'x', '/a'), true);
});

test('raw signals read JSON-LD entities, link hosts and visible text', () => {
  const html = `<html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[{"@type":"ProfilePage","mainEntity":{"@type":"MusicGroup","name":"Tim","sameAs":["https://open.spotify.com/x"]}}]}
    </script><script type="application/ld+json">{bad json</script></head>
    <body><h1>Tim &amp; Co</h1><a href="https://www.instagram.com/tim">ig</a>
    <a href="/about">about</a><a href="mailto:x@y.z">m</a></body></html>`;
  const signals = extractRawSignals(html, 'https://jov.ie/tim');
  assert.equal(signals.entityType, 'MusicGroup', 'most complete entity wins');
  assert.equal(signals.entityHasSameAs, true);
  assert.deepEqual(signals.linkHosts, ['instagram.com', 'jov.ie']);
  assert.match(signals.text, /Tim & Co/);
  assert.deepEqual(outboundHosts(signals.linkHosts, 'https://jov.ie/tim'), [
    'instagram.com',
  ]);
});

test('agent score is null when any check is unmeasured, never a zero', () => {
  const all = Object.fromEntries(AGENT_CHECKS.map(c => [c.id, 1]));
  assert.equal(agentScore(all).score, 100);
  assert.equal(
    agentScore({ ...all, link_extractability: 'na', llms_txt: 0 }).score,
    87.5,
    'n/a checks leave the denominator; 70 of 80 applicable points'
  );
  const partial = { ...all, llms_txt: null };
  assert.deepEqual(agentScore(partial), {
    score: null,
    unmeasured: ['llms_txt'],
  });
  assert.equal(
    AGENT_CHECKS.reduce((sum, c) => sum + c.weight, 0),
    100,
    'rubric weights must sum to 100'
  );
});

test('a claim passes only when Jovie beats every comparator by the margin', () => {
  const pass = evaluateClaim(
    lcpClaim,
    receipt([platform('jovie', 1000, 90), platform('platform-a', 2000, 50)])
  );
  assert.equal(pass.verdict, 'passes');
  // Within the 10% noise margin is not "faster".
  const close = evaluateClaim(
    lcpClaim,
    receipt([platform('jovie', 1950, 90), platform('platform-a', 2000, 50)])
  );
  assert.equal(close.verdict, 'fails');
  // Beating one platform but losing to another fails the "each" claim.
  const mixed = evaluateClaim(
    lcpClaim,
    receipt([
      platform('jovie', 1000, 90),
      platform('platform-a', 2000, 50),
      platform('platform-b', 900, 50),
    ])
  );
  assert.equal(mixed.verdict, 'fails');
  // A tie is not a win, even at zero.
  const tie = evaluateClaim(
    lcpClaim,
    receipt([platform('jovie', 0, 90), platform('platform-a', 0, 50)])
  );
  assert.equal(tie.verdict, 'fails');
});

test('missing comparator evidence is unknown, not a win (cherry-pick guard)', () => {
  const missing = evaluateClaim(
    lcpClaim,
    receipt([platform('jovie', 1000, 90), platform('platform-a', null, null)])
  );
  assert.equal(missing.verdict, 'unknown');
  const alone = evaluateClaim(lcpClaim, receipt([platform('jovie', 1000, 90)]));
  assert.equal(alone.verdict, 'unknown');
  const agent = evaluateClaim(
    { id: 'agent', metric: 'agent.score', better: 'higher' },
    receipt([platform('jovie', 1000, 95), platform('platform-a', 1000, 88)])
  );
  assert.equal(agent.verdict, 'fails', 'a 7-point lead is inside the margin');
});

test('the gate fails enforced claims that stop passing or lose evidence', () => {
  const doc = {
    claims: [
      { ...lcpClaim, state: 'holding' },
      {
        id: 'agent',
        metric: 'agent.score',
        better: 'higher',
        state: 'candidate',
      },
    ],
  };
  const good = runGate(
    doc,
    receipt([platform('jovie', 1000, 10), platform('platform-a', 2000, 90)])
  );
  assert.equal(good.ok, true, 'failing candidates do not fail the gate');
  const regressed = runGate(
    doc,
    receipt([platform('jovie', 3000, 10), platform('platform-a', 2000, 90)])
  );
  assert.equal(regressed.ok, false);
  const blind = runGate(
    doc,
    receipt([platform('jovie', 1000, 10), platform('platform-a', null, 90)])
  );
  assert.equal(blind.ok, false, 'unknown evidence fails an enforced claim');
});

test('committed claims never self-certify and use only known metrics', () => {
  for (const claim of claimsDoc.claims) {
    assert.ok(['candidate', 'holding'].includes(claim.state), claim.id);
    assert.match(claim.metric, /^(speed\.[a-z]+\.(median|p75)|agent\.score)$/);
  }
});

test('targets reject real platform names as ids', () => {
  assert.throws(
    () =>
      validateTargets({
        platforms: [
          { id: 'somebrand', profiles: [{ url: 'https://x.example/a' }] },
        ],
      }),
    /platform-<letter>/
  );
  assert.throws(
    () =>
      validateTargets({
        platforms: [
          { id: 'platform-a', profiles: [{ url: 'http://x.example/a' }] },
        ],
      }),
    /https/
  );
});

test('anonymized receipts carry no competitor URL, host, label or handle', () => {
  const raw = receipt([
    { ...platform('jovie', 1000, 90), label: 'Jovie' },
    {
      ...platform('platform-a', 2000, 50),
      label: 'SecretBrand',
      profiles: [
        {
          id: 'secrethandle',
          url: 'https://secretbrand.example/secrethandle',
          finalUrl: 'https://secretbrand.example/secrethandle',
          speed: { lcp: { median: 2000 } },
          agent: { score: 50, renderedHosts: ['a.example'], rawHosts: [] },
        },
      ],
    },
  ]);
  const text = JSON.stringify(anonymizeReceipt(raw));
  assert.doesNotMatch(text, /secretbrand|SecretBrand|secrethandle/);
  assert.match(text, /jov\.example|Jovie/);
  const anon = anonymizeReceipt(raw);
  assert.equal(anon.platforms[1].profiles[0].id, 'platform-a-1');
  assert.equal(anon.platforms[1].profiles[0].urlSha256.length, 16);
});

test('content checks: blocked fetch scores zero, failed render is unmeasured', () => {
  const html =
    '<html><body><h1>Tim</h1><a href="https://instagram.com/t">ig</a></body></html>';
  const signals = extractRawSignals(html, 'https://jov.ie/tim');
  const shown = {
    hosts: ['instagram.com', 'open.spotify.com', 'jov.ie'],
    name: 'Tim',
  };
  assert.deepEqual(contentChecks(signals, shown, 'https://jov.ie/tim'), {
    link_extractability: 0.5,
    identity_in_raw_html: 1,
    json_ld_entity: 0,
  });
  // The agent got a 403: it can extract nothing, whatever a browser sees.
  assert.deepEqual(contentChecks(null, shown, 'https://jov.ie/tim'), {
    link_extractability: 0,
    identity_in_raw_html: 0,
    json_ld_entity: 0,
  });
  // No browser ground truth: unmeasured, never "not applicable".
  const blind = contentChecks(signals, null, 'https://jov.ie/tim');
  assert.equal(blind.link_extractability, null);
  assert.equal(blind.identity_in_raw_html, null);
  // A page that shows no outbound links has nothing to extract.
  const none = contentChecks(
    signals,
    { hosts: ['jov.ie'], name: '' },
    'https://jov.ie/tim'
  );
  assert.equal(none.link_extractability, 'na');
  assert.equal(none.identity_in_raw_html, 'na');
});
