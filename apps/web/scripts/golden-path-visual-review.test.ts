import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmedBlockers,
  type KeyframeRecord,
  type KeyframeVerdict,
  main,
  parseModelVerdict,
  pathOf,
  readFirstVerdictKeyframes,
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
    const parsed = parseModelVerdict(
      '{"verdict":"pass","findings":["ok",{"n":1},"' + 'x'.repeat(400) + '"]}'
    );
    if (parsed.verdict !== 'pass') throw new Error('expected pass verdict');
    expect(parsed.findings).toEqual(['ok', 'x'.repeat(300)]);
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
    await expect(
      reviewWithModel({
        ...base,
        apiKey: 'k',
        fetchImpl: async () => {
          throw 'string failure';
        },
      })
    ).resolves.toMatchObject({ verdict: 'unknown', reason: 'request failed' });
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

  it('throws on a confirm-against file with no keyframes array, never a silent pass (Seer 17141336/0)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpr-confirm-against-'));
    try {
      const missing = join(dir, 'no-keyframes.json');
      writeFileSync(missing, JSON.stringify({ suspected: ['home'] }));
      expect(() => readFirstVerdictKeyframes(missing)).toThrow(
        'no keyframes array'
      );
      const ok = join(dir, 'ok.json');
      writeFileSync(ok, JSON.stringify({ keyframes: [verdict('home', true)] }));
      expect(readFirstVerdictKeyframes(ok)).toEqual([verdict('home', true)]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records only the URL path so query tokens never reach the model', () => {
    expect(pathOf('https://jov.ie/tim?mode=listen&token=secret')).toBe('/tim');
    expect(pathOf('not a url')).toBe('not a url');
  });

  it('reads the manifest.jsonl written by the keyframe capture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'golden-path-review-'));
    try {
      writeFileSync(
        join(dir, 'manifest.jsonl'),
        `${JSON.stringify(record())}\n${JSON.stringify(record({ overflowPx: 9 }))}\n`
      );
      expect(readManifest(dir)).toEqual([record(), record({ overflowPx: 9 })]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads keyframe records from the manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpr-manifest-'));
    try {
      writeFileSync(
        join(dir, 'manifest.jsonl'),
        `${JSON.stringify(record())}\n\n${JSON.stringify(record({ overflowPx: 3 }))}\n`
      );
      const records = readManifest(dir);
      expect(records).toHaveLength(2);
      expect(records[1]?.audit.overflowPx).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('main', () => {
    const dirs: string[] = [];
    afterEach(() => {
      while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    function setupDir(...records: KeyframeRecord[]) {
      const dir = mkdtempSync(join(tmpdir(), 'gpr-main-'));
      dirs.push(dir);
      writeFileSync(
        join(dir, 'manifest.jsonl'),
        records.map(r => JSON.stringify(r)).join('\n')
      );
      for (const r of records) writeFileSync(join(dir, r.file), 'png');
      return dir;
    }

    const passFetch = async () =>
      Response.json({
        choices: [{ message: { content: '{"verdict":"pass","findings":[]}' } }],
      });

    it('requires --dir and --out', async () => {
      await expect(main([], {})).rejects.toThrow('--dir and --out');
      const dir = setupDir(record());
      await expect(
        main(['--dir', dir, '--out', join(dir, 'v.json')], {})
        // no key -> model unknown, layout ok -> nothing suspected
      ).resolves.toBeUndefined();
    });

    it('fails when the capture recorded no keyframes', async () => {
      const dir = setupDir();
      await expect(
        main(['--dir', dir, '--out', join(dir, 'v.json')], {})
      ).rejects.toThrow('no keyframes recorded');
    });

    it('writes a first-phase verdict file from layout + model reviews', async () => {
      const dir = setupDir(record());
      const out = join(dir, 'verdict.json');
      await main(
        ['--dir', dir, '--out', out],
        { AI_GATEWAY_API_KEY: 'k', VISUAL_REVIEW_BASE_URL: 'https://gw.test' },
        passFetch
      );
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(written.phase).toBe('first');
      expect(written.confirmed).toEqual([]);
      expect(written.suspected).toEqual([]);
      expect(written.keyframes[0].id).toBe('public-profile');
      expect(written.keyframes[0].model).toEqual({
        verdict: 'pass',
        findings: [],
      });
    });

    it('exits 1 only when the replay confirms a suspected keyframe', async () => {
      const dir = setupDir(record(), record());
      const out = join(dir, 'replay.json');
      const firstVerdicts = {
        keyframes: [verdict('public-profile', true), verdict('other', true)],
      };
      const confirm = join(dir, 'first.json');
      writeFileSync(confirm, JSON.stringify(firstVerdicts));
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
      const blockerFetch = async () =>
        Response.json({
          choices: [
            {
              message: {
                content: '{"verdict":"blocker","findings":["layout: clipped"]}',
              },
            },
          ],
        });
      await main(
        ['--dir', dir, '--out', out, '--confirm-against', confirm],
        { AI_GATEWAY_API_KEY: 'k', VISUAL_REVIEW_BASE_URL: 'https://gw.test' },
        blockerFetch
      );
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(written.phase).toBe('replay');
      // 'other' was not flagged again in the replay, so it drops out
      expect(written.confirmed).toEqual(['public-profile']);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('rejects rather than silently passing when --confirm-against has no keyframes', async () => {
      const dir = setupDir(record());
      const confirm = join(dir, 'first.json');
      writeFileSync(confirm, JSON.stringify({ suspected: ['public-profile'] }));
      await expect(
        main(
          [
            '--dir',
            dir,
            '--out',
            join(dir, 'replay.json'),
            '--confirm-against',
            confirm,
          ],
          {}
        )
      ).rejects.toThrow('no keyframes array');
    });
  });
});
