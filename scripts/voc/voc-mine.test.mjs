import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  anonymize,
  classify,
  dedupe,
  exaSearch,
  renderIndexPage,
  setExaGateway,
  shortQuote,
  summarize,
  toItem,
} from './voc-mine.mjs';

const target = {
  id: 'lib-99',
  category: 'link-in-bio',
  name: 'Acme Links',
  aliases: ['acmelinks', 'acme.link'],
};
const observedAt = '2026-10-03T00:00:00.000Z';

describe('classify', () => {
  it('tags pain themes and payment objections on negative text', () => {
    const verdict = classify(
      'Totally overpriced for what it does, so I cancelled and switched to a free alternative.'
    );
    assert.ok(verdict);
    assert.ok(verdict.objections.includes('not-worth-price'));
    assert.ok(verdict.objections.includes('free-alternative'));
    assert.ok(verdict.objections.includes('churn'));
  });

  it('drops praise even when it mentions support or refunds', () => {
    assert.equal(
      classify(
        'Great customer service, they processed my refund quickly. Thank you!'
      ),
      null
    );
  });

  it('keeps any 1-3 star review that names a theme, regardless of tone words', () => {
    const verdict = classify('It just crashes when you try to add a link.', 1);
    assert.deepEqual(verdict?.pains, ['bugs-reliability']);
    assert.equal(verdict?.severity, 3);
  });

  it('ignores negative text with no known theme', () => {
    assert.equal(classify('This is bad.'), null);
  });

  it('marks charges after cancelling as pricing opacity and high severity', () => {
    const verdict = classify(
      'They charge without notifications, renew without authorizations and never refund.'
    );
    assert.ok(verdict?.objections.includes('pricing-opacity'));
    assert.equal(verdict?.severity, 3);
  });
});

describe('shortQuote', () => {
  it('keeps the strongest sentence and caps length', () => {
    const quote = shortQuote(
      'I signed up last spring. The editor freezes every time I add a link. Otherwise fine.'
    );
    assert.equal(quote, 'The editor freezes every time I add a link.');
    assert.ok(shortQuote('x '.repeat(400)).length <= 280);
  });
});

describe('items', () => {
  const item = toItem({
    target,
    url: 'https://example.com/review/1',
    sourceType: 'web',
    text: 'Acme Links is overpriced and support never replied.',
    observedAt,
  });

  it('builds a stable, classified item', () => {
    assert.ok(item);
    assert.equal(item.targetId, 'lib-99');
    assert.match(item.id, /^voc:[0-9a-f]{20}$/);
    assert.equal(
      toItem({
        target,
        url: 'https://example.com/review/1',
        sourceType: 'web',
        text: 'Acme Links is overpriced and support never replied.',
        observedAt,
      })?.id,
      item.id
    );
  });

  it('anonymizes product names and aliases', () => {
    assert.equal(
      anonymize('Left Acme Links (acme.link) for good', [target]),
      'Left [lib-99] ([lib-99]) for good'
    );
  });

  it('dedupes and summarizes per category', () => {
    const all = dedupe([item, item]);
    assert.equal(all.length, 1);
    const summary = summarize(all);
    assert.equal(summary['link-in-bio'].items, 1);
    assert.equal(summary['link-in-bio'].objections['not-worth-price'], 1);
  });
});

describe('brain index', () => {
  it('keeps curated report links and the trend series', () => {
    const page = renderIndexPage({
      date: '2026-10-10',
      curated: '- 2026-10-03: [[ops/voc/reports/2026-10-03]]',
      trend: [
        { date: '2026-10-03', summary: {} },
        { date: '2026-10-10', summary: {} },
      ],
    });
    assert.match(page, /\[\[ops\/voc\/reports\/2026-10-03\]\]/);
    const trend = JSON.parse(
      page.match(/```json voc-trend\n([\s\S]*?)\n```/)?.[1] ?? '[]'
    );
    assert.equal(trend.length, 2);
  });
});

describe('persona objections', () => {
  const data = JSON.parse(
    readFileSync(new URL('./persona-objections.json', import.meta.url), 'utf8')
  );

  it('grounds every funnel persona in mined evidence', () => {
    for (const persona of [
      'indie-release',
      'manager',
      'producer',
      'skeptic',
      'creator',
    ]) {
      const objections = data.personas[persona];
      assert.ok(objections?.length > 0, `${persona} has objections`);
      for (const o of objections) {
        assert.match(o.evidence.vocItemId, /^voc:[0-9a-f]{20}$/);
        assert.ok(o.evidence.quote.length > 0);
      }
    }
  });
});

describe('exa via the research gateway', () => {
  it('books gateway cost, keeps alias-matching highlights and stops at the cap', async () => {
    const calls = [];
    let n = 0;
    setExaGateway({
      deps: {},
      g: {
        async callSource(_deps, source, req) {
          calls.push({ source, ...req });
          n += 1;
          if (n > 1) {
            const error = new Error('exa cap reached: dailyUsd 1');
            error.name = 'CapExceeded';
            throw error;
          }
          return {
            status: 200,
            usd: 0.007,
            body: {
              results: [
                {
                  url: 'https://example.com/r',
                  highlights: [
                    'Acme Links is totally overpriced for what it does, so I cancelled and switched to a free alternative.',
                    'unrelated',
                  ],
                },
              ],
            },
          };
        },
      },
    });
    const cost = { exa: 0 };
    const items = await exaSearch(
      target,
      '2026-10-20T00:00:00Z',
      '2026-01-01',
      cost
    );
    assert.equal(cost.exa, 0.007);
    assert.equal(items.length, 1);
    assert.deepEqual(
      calls.map(c => [c.source, c.path, c.caller]),
      [
        ['exa', '/search', 'voc-mine'],
        ['exa', '/search', 'voc-mine'],
      ]
    );
    const after = await exaSearch(
      target,
      '2026-10-20T00:00:00Z',
      '2026-01-01',
      cost
    );
    assert.equal(
      after.length,
      0,
      'a capped gateway stops Exa for the rest of the run'
    );
    assert.equal(calls.length, 2);
    setExaGateway(null);
  });
});
