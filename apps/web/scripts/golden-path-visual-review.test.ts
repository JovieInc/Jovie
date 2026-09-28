import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  confirmedBlockers,
  type KeyframeRecord,
  type KeyframeVerdict,
  parseModelVerdict,
  pathOf,
  readManifest,
  reviewLayout,
  reviewWithModel,
} from './golden-path-visual-review';

function record(
  overrides: Partial<KeyframeRecord['audit']> = {},
  pageErrors: string[] = []
): KeyframeRecord {
  return {
    id: 'public-profile',
    sequence: 1,
    url: 'https://jov.ie/tim?mode=listen',
    file: '01-public-profile.png',
    sha256: 'a'.repeat(64),
    audit: {
      viewport: { width: 1280, height: 800 },
      overflowPx: 0,
      offscreenInteractive: [],
      smallTargets: [],
      brokenImages: [],
      ...overrides,
    },
    pageErrors,
  };
}

function verdict(id: string, suspected: boolean): KeyframeVerdict {
  return {
    id,
    sha256: 'b'.repeat(64),
    path: '/',
    layout: { blockers: [], warnings: [] },
    model: {
      verdict: suspected ? 'blocker' : 'pass',
      findings: suspected ? ['layout: x'] : [],
    },
    suspected,
  };
}

describe('golden path visual review', () => {
  it('reviewer B blocks on hard layout facts and only warns on polish', () => {
    expect(reviewLayout(record()).blockers).toEqual([]);
    const broken = reviewLayout(
      record(
        {
          overflowPx: 244,
          offscreenInteractive: ['button "Sign up"'],
          brokenImages: ['https://jov.ie/missing.png'],
          smallTargets: ['a "Privacy" 42x15'],
        },
        ['pageerror: boom', 'favicon 404']
      )
    );
    expect(broken.blockers).toEqual([
      'page scrolls sideways by 244px',
      'interactive element outside the viewport: button "Sign up"',
      'broken image: https://jov.ie/missing.png',
      'uncaught error: pageerror: boom',
    ]);
    expect(broken.warnings).toEqual([
      'console error: favicon 404',
      'tap target under 24px: a "Privacy" 42x15',
    ]);
  });

  it('never turns a malformed model reply into a pass', () => {
    expect(parseModelVerdict('{"verdict":"pass","findings":[]}')).toEqual({
      verdict: 'pass',
      findings: [],
    });
    expect(
      parseModelVerdict(
        'Sure! ```json\n{"verdict":"blocker","findings":["content: NaN shown"]}\n```'
      )
    ).toEqual({
      verdict: 'blocker',
      findings: ['content: NaN shown'],
    });
    expect(parseModelVerdict('')).toMatchObject({ verdict: 'unknown' });
    expect(parseModelVerdict('looks fine to me')).toMatchObject({
      verdict: 'unknown',
    });
    expect(
      parseModelVerdict('{"verdict":"blocker","findings":[]}')
    ).toMatchObject({ verdict: 'unknown' });
    expect(parseModelVerdict('{"verdict":"maybe"}')).toMatchObject({
      verdict: 'unknown',
    });
    expect(parseModelVerdict('{oops}')).toMatchObject({
      verdict: 'unknown',
      reason: 'invalid JSON',
    });
  });

  it('reviewer A reports unknown on outage, missing key or HTTP error', async () => {
    const png = Buffer.from('x');
    const base = {
      png,
      stepId: 'home',
      path: '/',
      baseUrl: 'https://gw.test/v1',
    };
    await expect(
      reviewWithModel({ ...base, apiKey: undefined })
    ).resolves.toMatchObject({ verdict: 'unknown' });
    await expect(
      reviewWithModel({
        ...base,
        apiKey: 'k',
        fetchImpl: async () => new Response('nope', { status: 503 }),
      })
    ).resolves.toMatchObject({ verdict: 'unknown', reason: 'gateway 503' });
    await expect(
      reviewWithModel({
        ...base,
        apiKey: 'k',
        fetchImpl: async () => {
          throw new Error('network down');
        },
      })
    ).resolves.toMatchObject({ verdict: 'unknown', reason: 'network down' });
  });

  it('reviewer A sends the image with the rubric and parses the verdict', async () => {
    let body:
      | { model: string; messages: { content: { type: string }[] }[] }
      | undefined;
    const result = await reviewWithModel({
      png: Buffer.from('png-bytes'),
      stepId: 'home',
      path: '/',
      apiKey: 'k',
      baseUrl: 'https://gw.test/v1/',
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe('https://gw.test/v1/chat/completions');
        body = JSON.parse(String(init?.body));
        return Response.json({
          choices: [
            {
              message: {
                content:
                  '{"verdict":"blocker","findings":["layout: CTA clipped"]}',
              },
            },
          ],
        });
      },
    });
    expect(result).toEqual({
      verdict: 'blocker',
      findings: ['layout: CTA clipped'],
    });
    expect(body?.model).toBe('zai/glm-5.3-flash');
    expect(body?.messages[0]?.content.map(part => part.type)).toEqual([
      'text',
      'image_url',
    ]);
  });

  it('confirms a blocker only when the replay flags the same keyframe', () => {
    const first = [
      verdict('home', true),
      verdict('dashboard', true),
      verdict('profile', false),
    ];
    const replay = [
      verdict('home', true),
      verdict('dashboard', false),
      verdict('profile', true),
    ];
    expect(confirmedBlockers(first, replay)).toEqual(['home']);
    expect(
      confirmedBlockers(
        first,
        first.map(v => ({ ...v, suspected: false }))
      )
    ).toEqual([]);
  });

  it('records only the URL path so query tokens never reach the model', () => {
    expect(pathOf('https://jov.ie/tim?mode=listen&token=secret')).toBe('/tim');
    expect(pathOf('not a url')).toBe('not a url');
  });

  it('reads the manifest.jsonl written by the keyframe capture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'golden-path-review-'));
    writeFileSync(
      join(dir, 'manifest.jsonl'),
      `${JSON.stringify(record())}\n${JSON.stringify(record({ overflowPx: 9 }))}\n`
    );
    expect(readManifest(dir)).toEqual([record(), record({ overflowPx: 9 })]);
  });
});
