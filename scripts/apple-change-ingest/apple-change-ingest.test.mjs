import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeObservation } from '../idea-radar/idea-radar.mjs';
import {
  acceptPriorReceipt,
  assessItems,
  classifyItem,
  contentHash,
  decideDisposition,
  loadSources,
  parseFeed,
  priorHashIndex,
  runIngest,
  SCHEMA,
  toIdeaRadarObservation,
} from './apple-change-ingest.mjs';

const releaseFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Releases</title>
<item>
  <title>iOS 27.2.1 (24B156)</title>
  <link>https://developer.apple.com/news/releases/?id=ga-ios</link>
  <guid>https://developer.apple.com/news/releases/?id=ga-ios</guid>
  <pubDate>Mon, 16 Nov 2026 10:00:00 PST</pubDate>
  <description>View release notes</description>
</item>
<item>
  <title>Xcode 27.3 beta 2 (27C5035i)</title>
  <link>https://developer.apple.com/news/releases/?id=beta-xcode</link>
  <guid>https://developer.apple.com/news/releases/?id=beta-xcode</guid>
  <pubDate>Mon, 16 Nov 2026 10:00:00 PST</pubDate>
  <description>View downloads View release notes</description>
</item>
<item>
  <title>tvOS 27.2.1 (24K157)</title>
  <link>https://developer.apple.com/news/releases/?id=tvos</link>
  <guid>https://developer.apple.com/news/releases/?id=tvos</guid>
  <pubDate>Mon, 16 Nov 2026 10:00:00 PST</pubDate>
  <description>View downloads</description>
</item>
<item>
  <title>Xcode 27.2 (27B52)</title>
  <link>https://developer.apple.com/news/releases/?id=ga-xcode</link>
  <guid>https://developer.apple.com/news/releases/?id=ga-xcode</guid>
  <pubDate>Fri, 14 Nov 2026 10:00:00 PST</pubDate>
  <description>View release notes</description>
</item>
</channel></rss>`;

const newsFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>News</title>
<item>
  <title>Updated App Store Review Guidelines: privacy and security</title>
  <link>https://developer.apple.com/news/?id=security-guidelines</link>
  <guid>https://developer.apple.com/news/?id=security-guidelines</guid>
  <pubDate>Wed, 18 Nov 2026 06:00:00 PST</pubDate>
  <description>Security and privacy updates for App Store distribution.</description>
</item>
<item>
  <title>WWDC26 session 101: SwiftUI performance</title>
  <link>https://developer.apple.com/news/?id=wwdc-perf</link>
  <guid>https://developer.apple.com/news/?id=wwdc-perf</guid>
  <pubDate>Tue, 10 Jun 2026 09:00:00 PDT</pubDate>
  <description>Session guidance on SwiftUI performance.</description>
</item>
</channel></rss>`;

test('sources registry is https-only and names the freshness limit', () => {
  const registry = loadSources();
  assert.equal(registry.sources.length, 2);
  assert.match(registry.freshness.documentedLimit, /24h/);
  for (const source of registry.sources) {
    assert.equal(new URL(source.canonicalUrl).protocol, 'https:');
  }
});

test('parseFeed records canonical url, guid, pubDate, and content hash', () => {
  const items = parseFeed(releaseFeed, {
    sourceId: 'apple-developer-releases',
    observedAt: '2026-11-20T18:00:00.000Z',
  });
  assert.equal(items.length, 4);
  const first = items[0];
  assert.equal(
    first.sourceItemId,
    'https://developer.apple.com/news/releases/?id=ga-ios'
  );
  assert.equal(
    first.canonicalUrl,
    'https://developer.apple.com/news/releases/?id=ga-ios'
  );
  assert.equal(first.publishedAt, '2026-11-16T18:00:00.000Z');
  assert.equal(
    first.contentHash,
    contentHash(`${first.sourceItemId}\n${first.title}\n${first.summary}`)
  );
});

test('parseFeed rejects invalid pubDate with invalid_pubDate, not RangeError', () => {
  const bad = `<?xml version="1.0"?><rss version="2.0"><channel>
<item>
  <title>Xcode 27.2 (27B52)</title>
  <link>https://developer.apple.com/news/releases/?id=bad-date</link>
  <guid>https://developer.apple.com/news/releases/?id=bad-date</guid>
  <pubDate>not-a-real-date</pubDate>
  <description>View release notes</description>
</item>
</channel></rss>`;
  assert.throws(
    () =>
      parseFeed(bad, {
        sourceId: 'apple-developer-releases',
        observedAt: '2026-11-20T18:00:00.000Z',
      }),
    err =>
      err instanceof Error &&
      /invalid_pubDate:apple-developer-releases:/.test(err.message) &&
      !(err instanceof RangeError)
  );
});

test('classifier maps platforms, isolates betas, and drops tvOS-only', () => {
  const beta = classifyItem({
    title: 'Xcode 27.3 beta 2 (27C5035i)',
    summary: 'View release notes',
  });
  assert.equal(beta.lane, 'compatibility');
  assert.deepEqual(beta.targets, [
    'jovie-ios',
    'jovie-macos',
    'lyb-ios',
    'native-ci',
  ]);

  const tv = classifyItem({ title: 'tvOS 27.2.1 (24K157)', summary: '' });
  assert.equal(tv.platformHit, false);

  const gaXcode = classifyItem({ title: 'Xcode 27.2 (27B52)', summary: '' });
  assert.equal(gaXcode.lane, 'production');
  assert.ok(gaXcode.categories.includes('ci'));
});

test('dispositions justify action, compatibility-lane, and no-action', () => {
  const items = parseFeed(releaseFeed, {
    sourceId: 'apple-developer-releases',
    observedAt: '2026-11-20T18:00:00.000Z',
  });
  const assessed = assessItems({ items });
  const byTitle = Object.fromEntries(assessed.map(i => [i.title, i]));

  assert.equal(
    byTitle['Xcode 27.3 beta 2 (27C5035i)'].disposition,
    'compatibility-lane'
  );
  assert.equal(byTitle['tvOS 27.2.1 (24K157)'].disposition, 'no-action');
  assert.equal(byTitle['Xcode 27.2 (27B52)'].disposition, 'action');
  assert.match(byTitle['Xcode 27.2 (27B52)'].justification, /CI/);

  const security = assessItems({
    items: parseFeed(newsFeed, {
      sourceId: 'apple-developer-news',
      observedAt: '2026-11-20T18:00:00.000Z',
    }),
  });
  const sec = security.find(i => /security/i.test(i.title));
  assert.equal(sec.disposition, 'action');
  assert.ok(sec.categories.includes('security'));
  const wwdc = security.find(i => /WWDC/i.test(i.title));
  assert.equal(wwdc.disposition, 'no-action');
});

test('same guid with new hash is a meaningful revision', () => {
  const item = {
    title: 'Xcode 27.2 (27B52)',
    summary: 'updated notes',
    sourceItemId: 'https://developer.apple.com/news/releases/?id=ga-xcode',
    canonicalUrl: 'https://developer.apple.com/news/releases/?id=ga-xcode',
    publishedAt: '2026-11-14T18:00:00.000Z',
    contentHash: contentHash('new'),
    firstObservedAt: '2026-11-20T18:00:00.000Z',
  };
  const classified = classifyItem(item);
  const decision = decideDisposition(item, classified, {
    priorHash: contentHash('old'),
  });
  assert.equal(decision.revision, true);
  assert.equal(
    priorHashIndex([
      { sourceItemId: item.sourceItemId, contentHash: 'abc' },
    ]).get(item.sourceItemId),
    'abc'
  );
});

test('action items normalize through idea-radar without a separate ledger', () => {
  const assessed = assessItems({
    items: parseFeed(newsFeed, {
      sourceId: 'apple-developer-news',
      observedAt: '2026-11-20T18:00:00.000Z',
    }),
  }).find(i => i.disposition === 'action');
  assert.ok(assessed);
  const observation = toIdeaRadarObservation(
    assessed,
    '2026-11-20T18:00:00.000Z'
  );
  const evidence = normalizeObservation(observation);
  assert.equal(evidence.provenance.sourceType, 'apple-developer-rss');
  assert.ok(evidence.id.startsWith('evidence:'));
});

test('acceptPriorReceipt refuses failed or itemless receipts', () => {
  assert.equal(acceptPriorReceipt(null), null);
  assert.equal(
    acceptPriorReceipt({ ok: false, items: [{ sourceItemId: 'a' }] }),
    null
  );
  assert.equal(acceptPriorReceipt({ ok: true }), null);
  assert.equal(
    acceptPriorReceipt({
      ok: true,
      items: [{ sourceItemId: 'a', contentHash: 'h' }],
    })?.ok,
    true
  );
});

test('runIngest fails closed when a source errors and writes a full receipt', async () => {
  const registry = loadSources();
  const pages = new Map([
    [registry.sources[0].canonicalUrl, releaseFeed],
    [registry.sources[1].canonicalUrl, newsFeed],
  ]);
  /** @type {typeof fetch} */
  const okFetch = async url => {
    const body = pages.get(String(url)) ?? '';
    return /** @type {Response} */ ({
      ok: true,
      status: 200,
      text: async () => body,
    });
  };
  const ok = await runIngest({
    registry,
    observedAt: '2026-11-20T18:00:00.000Z',
    fetchImpl: okFetch,
  });
  assert.equal(ok.schema, SCHEMA);
  assert.equal(ok.ok, true);
  assert.ok(ok.counts.action >= 1);
  assert.ok(ok.counts.compatibilityLane >= 1);
  assert.ok(ok.ideaRadarCandidates.length >= 1);

  /** @type {typeof fetch} */
  const badFetch = async () =>
    /** @type {Response} */ ({
      ok: false,
      status: 503,
      text: async () => '',
    });
  const failed = await runIngest({
    registry,
    observedAt: '2026-11-20T18:00:00.000Z',
    fetchImpl: badFetch,
  });
  assert.equal(failed.ok, false);
  assert.match(failed.failure, /http_503/);
});

test('checked-in sources.json stays the thin two-feed slice', () => {
  const raw = JSON.parse(
    readFileSync(new URL('./sources.json', import.meta.url), 'utf8')
  );
  assert.deepEqual(
    raw.sources.map(s => s.id),
    ['apple-developer-releases', 'apple-developer-news']
  );
});
