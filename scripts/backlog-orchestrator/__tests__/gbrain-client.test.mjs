import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  keywordAttemptsFor,
  parsePage,
  parseSearchSlugs,
  searchPages,
} from '../gbrain-client.mjs';

const JOV_5265_TITLE_TERMS =
  'canonize scene-first color harmony generated brand imagery';
const JOV_5265_LONG_QUERY = `existing agent work and prior decisions related to ${JOV_5265_TITLE_TERMS}`;
const COLOR_HARMONY_SLUG =
  'design/jovie-imagery-color-harmony-proposal-2026-08-21';
const COLOR_HARMONY_PAGE = {
  slug: COLOR_HARMONY_SLUG,
  id: '27842',
  revision: '2026-08-21T00:00:00Z',
  compiledTruth: 'Founder approved scene-first color harmony.',
};

describe('keyword-first GBrain lookup (JOV-5268)', () => {
  it('keeps the installed text CLI contract and parses JSON hits', () => {
    const raw =
      "---\ntype: coordination\nupdated_at: '2026-08-13T00:00:00Z'\n---\n\n# Current ownership\n";
    const page = parsePage('agent-org-chart', raw);
    assert.equal(page?.revision, '2026-08-13T00:00:00Z');
    assert.deepEqual(parseSearchSlugs('[0.99] one/page -- first'), [
      'one/page',
    ]);
    assert.deepEqual(parseSearchSlugs('[]'), []);
    assert.deepEqual(
      parseSearchSlugs(
        JSON.stringify([
          { slug: COLOR_HARMONY_SLUG, page_id: 27842 },
          { slug: COLOR_HARMONY_SLUG, page_id: 27842 },
        ])
      ),
      [COLOR_HARMONY_SLUG]
    );
    const jsonPage = parsePage(
      'agent-org-chart',
      JSON.stringify({
        id: 6467,
        slug: 'agent-org-chart',
        compiled_truth: 'implementation owner: Symphony',
        frontmatter: { updated_at: '2026-08-13T10:05:56.009Z' },
      })
    );
    assert.equal(jsonPage?.id, 6467);
    assert.equal(jsonPage?.revision, '2026-08-13T10:05:56.009Z');
  });

  it('builds bounded JOV-5265 issue-term attempts including color harmony', () => {
    const attempts = keywordAttemptsFor(JOV_5265_LONG_QUERY, 'JOV-5265');
    assert.ok(attempts.length <= 5);
    assert.equal(attempts[0], JOV_5265_TITLE_TERMS);
    assert.ok(attempts.includes('color harmony'));
    assert.ok(attempts.includes('JOV-5265'));
  });

  it('binds JOV-5265 through keyword search when the long hybrid query times out', async () => {
    const calls = [];
    const pages = await searchPages(JOV_5265_LONG_QUERY, 1, {
      identifier: 'JOV-5265',
      run(args) {
        calls.push(args);
        if (args[0] === 'query') {
          return {
            ok: false,
            timedOut: false,
            stdout: '',
            stderr: 'canceling statement due to statement timeout',
          };
        }
        if (args[0] === 'search' && args[1] === 'color harmony') {
          return {
            ok: true,
            timedOut: false,
            stdout: `[0.99] ${COLOR_HARMONY_SLUG} -- Jovie imagery color harmony`,
            stderr: '',
          };
        }
        return { ok: true, timedOut: false, stdout: '[]', stderr: '' };
      },
      async getPage(slug) {
        assert.equal(slug, COLOR_HARMONY_SLUG);
        return COLOR_HARMONY_PAGE;
      },
    });
    assert.deepEqual(pages, [COLOR_HARMONY_PAGE]);
    assert.equal(
      calls.some(args => args[0] === 'query'),
      false,
      'semantic query must not run after a keyword hit'
    );
    assert.ok(calls.some(args => args[0] === 'search'));
  });

  it('keeps a keyword page when a later semantic command fails', async () => {
    let queryCalls = 0;
    const pages = await searchPages(
      `ownership and current priorities for ${JOV_5265_TITLE_TERMS}`,
      1,
      {
        identifier: 'JOV-5265',
        run(args) {
          if (args[0] === 'query') {
            queryCalls += 1;
            return {
              ok: false,
              timedOut: true,
              stdout: '',
              stderr: 'canceling statement due to statement timeout',
            };
          }
          return {
            ok: true,
            timedOut: false,
            stdout: JSON.stringify([
              { slug: COLOR_HARMONY_SLUG, page_id: 27842 },
            ]),
            stderr: '',
          };
        },
        async getPage() {
          return COLOR_HARMONY_PAGE;
        },
      }
    );
    assert.deepEqual(pages, [COLOR_HARMONY_PAGE]);
    assert.equal(queryCalls, 0);
  });

  it('returns a healthy miss when keyword and semantic both bind nothing', async () => {
    const pages = await searchPages(JOV_5265_LONG_QUERY, 1, {
      identifier: 'JOV-5265',
      run() {
        return { ok: true, timedOut: false, stdout: '[]', stderr: '' };
      },
      async getPage() {
        throw new Error('getPage must not run on an empty search');
      },
    });
    assert.deepEqual(pages, []);
  });

  it('throws when every supported lookup path errors', async () => {
    await assert.rejects(
      () =>
        searchPages(JOV_5265_LONG_QUERY, 1, {
          identifier: 'JOV-5265',
          run() {
            return {
              ok: false,
              timedOut: false,
              stdout: '',
              stderr: 'gbrain unreachable',
            };
          },
        }),
      /gbrain unreachable|gbrain-unavailable/
    );
  });
});
