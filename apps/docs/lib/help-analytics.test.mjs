import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articleIdFromPathname,
  buildHelpAnalyticsEvent,
  HELP_ANALYTICS_EVENTS,
  HELP_ANALYTICS_SCHEMA_VERSION,
  hashQuery,
  normalizeQuery,
  queryLengthBucket,
  referrerClass,
  trackHelpCenterEvent,
  viewportClass,
} from './help-analytics.mjs';

test('contract covers every required instrumentation event', () => {
  for (const event of [
    'help_center_viewed',
    'category_opened',
    'article_viewed',
    'search_opened',
    'search_query_submitted',
    'search_result_selected',
    'search_zero_results',
    'article_feedback',
    'related_guide_selected',
    'contact_support_opened',
    'support_request_submitted',
    'support_request_failed',
    'support_escalation',
  ]) {
    assert.ok(HELP_ANALYTICS_EVENTS.includes(event), event);
  }
});

test('query normalization is stable and strips control characters', () => {
  assert.equal(normalizeQuery('  HelLO\t Billing\n '), 'hello billing');
  assert.equal(normalizeQuery(''), '');
  assert.equal(normalizeQuery(null), '');
  assert.ok(normalizeQuery('x'.repeat(500)).length <= 128);
});

test('query length buckets are coarse', () => {
  assert.equal(queryLengthBucket(''), 'na');
  assert.equal(queryLengthBucket('billing'), 'le_8');
  assert.equal(queryLengthBucket('a'.repeat(24)), 'le_24');
  assert.equal(queryLengthBucket('a'.repeat(64)), 'le_64');
  assert.equal(queryLengthBucket('a'.repeat(65)), 'gt_64');
});

test('query hashing is deterministic, privacy-safe, and never raw', async () => {
  const first = await hashQuery('  Billing Question  ');
  const second = await hashQuery('billing question');
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{16}$/);
  assert.ok(!first.includes('billing'));
  assert.equal(await hashQuery(''), '');
});

test('article ids derive only from canonical docs paths', () => {
  assert.equal(articleIdFromPathname('/docs/features/tips'), 'features/tips');
  assert.equal(articleIdFromPathname('/docs'), 'index');
  assert.equal(articleIdFromPathname('/'), null);
  assert.equal(articleIdFromPathname('/docs/../../etc/passwd'), null);
  assert.equal(articleIdFromPathname('/docs/Bad Path!'), null);
});

test('payload builder enforces the allowlist and version', () => {
  const event = buildHelpAnalyticsEvent('search_result_selected', {
    article_id: 'features/tips',
    result_id: 'features/tips',
    result_rank: 2,
    raw_query: 'this must never ship',
    dom_text: 'also banned',
    user_email: 'nope@example.com',
  });
  assert.equal(event.schema_version, HELP_ANALYTICS_SCHEMA_VERSION);
  assert.equal(event.event, 'search_result_selected');
  assert.ok(event.event_id.endsWith(':search_result_selected'));
  assert.equal(event.result_rank, 2);
  assert.equal('raw_query' in event, false);
  assert.equal('dom_text' in event, false);
  assert.equal('user_email' in event, false);
});

test('payload builder rejects unknown events and malformed ids', () => {
  assert.equal(buildHelpAnalyticsEvent('not_an_event'), null);
  const event = buildHelpAnalyticsEvent('article_viewed', {
    article_id: 'not a valid id!',
    result_rank: -1,
  });
  assert.equal('article_id' in event, false);
  assert.equal('result_rank' in event, false);
});

test('referrer class buckets internal, external, and direct', () => {
  assert.equal(referrerClass('docs.jov.ie', ''), 'direct');
  assert.equal(referrerClass('docs.jov.ie', 'docs.jov.ie'), 'internal');
  assert.equal(referrerClass('docs.jov.ie', 'app.jov.ie'), 'internal');
  assert.equal(referrerClass('docs.jov.ie', 'google.com'), 'external');
  assert.equal(referrerClass('', 'x'), 'unknown');
});

test('viewport classes match breakpoints', () => {
  assert.equal(viewportClass(375), 'sm');
  assert.equal(viewportClass(800), 'md');
  assert.equal(viewportClass(1200), 'lg');
  assert.equal(viewportClass(1600), 'xl');
});

test('trackHelpCenterEvent never throws when transports fail', async () => {
  assert.equal(
    await trackHelpCenterEvent(
      'article_viewed',
      { article_id: 'index' },
      {
        beaconImpl: () => false,
        fetchImpl: () => Promise.reject(new Error('offline')),
      }
    ),
    false
  );
  assert.equal(await trackHelpCenterEvent('not_real', {}, {}), false);
  assert.equal(
    await trackHelpCenterEvent(
      'article_viewed',
      {},
      { beaconImpl: () => true }
    ),
    true
  );
});

test('trackHelpCenterEvent sends through sendBeacon first', async () => {
  let sent = '';
  const ok = await trackHelpCenterEvent(
    'search_zero_results',
    { query_hash: 'abc123', source_surface: 'search_zero_results' },
    {
      beaconImpl: (url, body) => {
        sent = String(body);
        return url.includes('/api/analytics/help-center');
      },
    }
  );
  assert.equal(ok, true);
  const payload = JSON.parse(sent);
  assert.equal(payload.event, 'search_zero_results');
  assert.equal(payload.query_hash, 'abc123');
});
