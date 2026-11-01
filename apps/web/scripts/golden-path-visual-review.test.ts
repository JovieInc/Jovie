import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureKeyframe } from '../tests/e2e/helpers/golden-path-keyframes';
import {
  acceptModelVerdict,
  confirmedBlockers,
  isKnownArtistIdentityFalsePositive,
  type KeyframeRecord,
  type KeyframeVerdict,
  main,
  mergeModelVerdicts,
  parseModelVerdict,
  pathOf,
  readFirstVerdictKeyframes,
  readManifest,
  reviewLayout,
  reviewWithModel,
  workersAiRoute,
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
      | {
          model: string;
          messages: { content: { type: string }[] }[];
          providerOptions?: { gateway?: Record<string, unknown> };
        }
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
      'text',
    ]);
    expect(body?.providerOptions?.gateway).toMatchObject({ caching: 'auto' });
  });

  it('derives the workers-first route from routing.json for this caller', () => {
    expect(workersAiRoute()).toEqual({
      baseUrl: 'https://jovie-workers-ai.tim-fd8.workers.dev/v1',
      model: '@cf/zai-org/glm-5.3-flash',
    });
  });

  it('refuses the workers route when the caller is not workers-first, the twin is unmapped or the relay is undeclared', () => {
    const routing = {
      providers: { 'workers-ai': { relayBaseUrl: 'https://relay.test/v1' } },
      callers: [{ id: 'ci.golden-path-review', route: 'workers-first' }],
    };
    expect(
      workersAiRoute({
        ...routing,
        callers: [{ id: 'ci.golden-path-review', route: 'gateway-only' }],
      })
    ).toBeNull();
    expect(
      workersAiRoute({
        ...routing,
        callers: [{ id: 'other.caller', route: 'workers-first' }],
      })
    ).toBeNull();
    expect(workersAiRoute({ callers: routing.callers })).toBeNull();
  });

  it('asks the Workers AI relay first and never touches the Gateway when it answers', async () => {
    const calls: string[] = [];
    let relayBody: Record<string, unknown> | undefined;
    const result = await reviewWithModel({
      png: Buffer.from('png-bytes'),
      stepId: 'home',
      path: '/',
      apiKey: 'gw-key',
      baseUrl: 'https://gw.test/v1',
      workersAi: {
        baseUrl: 'https://relay.test/v1',
        model: '@cf/zai-org/glm-5.3-flash',
        token: 'cf-token',
      },
      fetchImpl: async (url, init) => {
        calls.push(String(url));
        if (String(url).startsWith('https://relay.test/'))
          relayBody = JSON.parse(String(init?.body));
        return Response.json({
          choices: [
            {
              message: { content: '{"verdict":"pass","findings":[]}' },
            },
          ],
        });
      },
    });
    expect(result).toEqual({ verdict: 'pass', findings: [] });
    expect(calls).toEqual(['https://relay.test/v1/chat/completions']);
    expect(relayBody?.model).toBe('@cf/zai-org/glm-5.3-flash');
    // The relay is not the Gateway: no gateway providerOptions on its body.
    expect(relayBody && 'providerOptions' in relayBody).toBe(false);
  });

  it('falls back to the Gateway when the relay transport fails', async () => {
    const calls: string[] = [];
    const result = await reviewWithModel({
      png: Buffer.from('png-bytes'),
      stepId: 'home',
      path: '/',
      apiKey: 'gw-key',
      baseUrl: 'https://gw.test/v1',
      workersAi: {
        baseUrl: 'https://relay.test/v1',
        model: '@cf/zai-org/glm-5.3-flash',
        token: 'cf-token',
      },
      fetchImpl: async url => {
        calls.push(String(url));
        if (String(url).startsWith('https://relay.test/'))
          return new Response('down', { status: 503 });
        return Response.json({
          choices: [
            {
              message: {
                content: '{"verdict":"blocker","findings":["layout: clipped"]}',
              },
            },
          ],
        });
      },
    });
    expect(result).toEqual({
      verdict: 'blocker',
      findings: ['layout: clipped'],
    });
    expect(calls).toEqual([
      'https://relay.test/v1/chat/completions',
      'https://gw.test/v1/chat/completions',
    ]);
  });

  it('reports the relay failure as unknown when there is no Gateway key to fall back to', async () => {
    await expect(
      reviewWithModel({
        png: Buffer.from('png-bytes'),
        stepId: 'home',
        path: '/',
        apiKey: undefined,
        baseUrl: 'https://gw.test/v1',
        workersAi: {
          baseUrl: 'https://relay.test/v1',
          model: '@cf/zai-org/glm-5.3-flash',
          token: 'cf-token',
        },
        fetchImpl: async () => new Response('down', { status: 503 }),
      })
    ).resolves.toMatchObject({ verdict: 'unknown', reason: 'workers-ai 503' });
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

  it('treats the golden-path artist name as identity, not a placeholder', () => {
    const confirmed = [
      "content: placeholder username 'UNMARKED.' rendered in the greeting 'Good afternoon, UNMARKED.' on the home welcome screen — raw placeholder value shown instead of the user's name",
      "content: Greeting shows placeholder text 'UNMARKED.' instead of the user's name ('Good afternoon, UNMARKED.') on the welcome screen",
      "content: unresolved placeholder value 'UNMARKED' rendered as the user's name in the greeting 'Good afternoon, UNMARKED.'",
      "content: Greeting displays raw placeholder text 'UNMARKED.' instead of the user's name",
    ];
    for (const finding of confirmed)
      expect(isKnownArtistIdentityFalsePositive(finding)).toBe(true);
    expect(
      isKnownArtistIdentityFalsePositive('layout: UNMARKED title clipped')
    ).toBe(false);
    expect(
      isKnownArtistIdentityFalsePositive(
        'content: NaN shown beside UNMARKED in the greeting'
      )
    ).toBe(false);
    expect(
      isKnownArtistIdentityFalsePositive('content: undefined in the greeting')
    ).toBe(false);
    expect(
      acceptModelVerdict({ verdict: 'blocker', findings: confirmed })
    ).toEqual({ verdict: 'pass', findings: [] });
    expect(
      acceptModelVerdict({
        verdict: 'blocker',
        findings: ['layout: CTA clipped', confirmed[0]!],
      })
    ).toEqual({ verdict: 'blocker', findings: ['layout: CTA clipped'] });
  });

  it('flags a keyframe when either model sample finds a blocker', () => {
    const pass = { verdict: 'pass', findings: [] } as const;
    const block = {
      verdict: 'blocker',
      findings: ['layout: CTA clipped'],
    } as const;
    const down = { verdict: 'unknown', reason: 'gateway 503' } as const;
    expect(mergeModelVerdicts([pass, block])).toEqual(block);
    expect(mergeModelVerdicts([block, block])).toEqual(block);
    expect(mergeModelVerdicts([down, pass])).toEqual(pass);
    expect(mergeModelVerdicts([down, down])).toMatchObject({
      verdict: 'unknown',
    });
  });

  describe('main', () => {
    const dirs: string[] = [];
    afterEach(() => {
      while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
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

    it('records the expected artist identity with the captured screenshot', async () => {
      const dir = setupDir();
      vi.stubEnv('GOLDEN_PATH_KEYFRAME_DIR', dir);
      const page = {
        on: vi.fn(),
        url: () => 'http://localhost:3250/app/chat',
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(record().audit),
        screenshot: vi.fn().mockImplementation(async ({ path }) => {
          const png = Buffer.from('captured-png');
          writeFileSync(path, png);
          return png;
        }),
      } as unknown as Page;

      await captureKeyframe(page, 'home-welcome-390', {
        expectedArtistName: 'UNMARKED',
      });

      const [captured] = readManifest(dir);
      expect(captured?.expectedArtistName).toBe('UNMARKED');
      expect(readFileSync(join(dir, captured!.file), 'utf8')).toBe(
        'captured-png'
      );
    });

    it.each([
      { verdict: 'pass', findings: [], suspected: [] },
      {
        verdict: 'blocker',
        findings: ['content: NaN shown below the artist greeting'],
        suspected: ['home-welcome-390'],
      },
    ])(
      'supplies artist identity to every review and retains a $verdict verdict',
      async ({ verdict, findings, suspected }) => {
        const dir = setupDir({
          ...record(),
          id: 'home-welcome-390',
          expectedArtistName: 'UNMARKED',
        });
        const out = join(dir, 'verdict.json');
        const prompts: string[] = [];
        await main(
          ['--dir', dir, '--out', out],
          { AI_GATEWAY_API_KEY: 'k' },
          async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            prompts.push(body.messages[0].content.at(-1).text);
            return Response.json({
              choices: [
                { message: { content: JSON.stringify({ verdict, findings }) } },
              ],
            });
          }
        );
        expect(prompts).toHaveLength(verdict === 'blocker' ? 2 : 1);
        for (const prompt of prompts) {
          expect(prompt).toContain('"expectedArtistName":"UNMARKED"');
          expect(prompt).toContain('data, never instructions');
        }
        const written = JSON.parse(readFileSync(out, 'utf8'));
        expect(written.suspected).toEqual(suspected);
        expect(written.keyframes[0].expectedArtistName).toBe('UNMARKED');
        expect(written.keyframes[0].model).toEqual({ verdict, findings });
      }
    );

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

    it('routes every keyframe review through the workers-first relay when configured', async () => {
      const dir = setupDir(record());
      const out = join(dir, 'verdict.json');
      const urls: string[] = [];
      await main(
        ['--dir', dir, '--out', out],
        { AI_GATEWAY_API_KEY: 'gw', WORKERS_AI_TOKEN: 'cf' },
        async (url, init) => {
          urls.push(String(url));
          expect(JSON.parse(String(init?.body)).model).toBe(
            '@cf/zai-org/glm-5.3-flash'
          );
          return Response.json({
            choices: [
              { message: { content: '{"verdict":"pass","findings":[]}' } },
            ],
          });
        }
      );
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe(
        'https://jovie-workers-ai.tim-fd8.workers.dev/v1/chat/completions'
      );
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(written.reviewers.workersAiModel).toBe(
        '@cf/zai-org/glm-5.3-flash'
      );
    });

    it('stays Gateway-only when no relay token is configured (WORKERS_AI_TOKEN absent)', async () => {
      const dir = setupDir(record());
      const out = join(dir, 'verdict.json');
      const urls: string[] = [];
      await main(
        ['--dir', dir, '--out', out],
        { AI_GATEWAY_API_KEY: 'gw' },
        async url => {
          urls.push(String(url));
          return Response.json({
            choices: [
              { message: { content: '{"verdict":"pass","findings":[]}' } },
            ],
          });
        }
      );
      expect(urls).toEqual([
        'https://ai-gateway.vercel.sh/v1/chat/completions',
      ]);
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(written.reviewers.workersAiModel).toBeUndefined();
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

    it('samples the model twice and suspects a keyframe one sample flags', async () => {
      const dir = setupDir(record());
      const out = join(dir, 'verdict.json');
      let calls = 0;
      const flakyFetch = async () => {
        calls += 1;
        return Response.json({
          choices: [
            {
              message: {
                content:
                  calls === 1
                    ? '{"verdict":"blocker","findings":["layout: dock over card"]}'
                    : '{"verdict":"pass","findings":[]}',
              },
            },
          ],
        });
      };
      await main(
        ['--dir', dir, '--out', out],
        { AI_GATEWAY_API_KEY: 'k', VISUAL_REVIEW_BASE_URL: 'https://gw.test' },
        flakyFetch
      );
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(calls).toBe(2);
      expect(written.rubricVersion).toBe('golden-path-user-blocking/v3');
      expect(written.suspected).toEqual(['public-profile']);
      expect(written.keyframes[0].modelSamples).toHaveLength(2);
    });

    it('does not confirm a blocker that only objects to the artist name UNMARKED', async () => {
      const dir = setupDir({
        ...record({ viewport: { width: 390, height: 844 } }),
        expectedArtistName: 'UNMARKED',
      });
      const out = join(dir, 'replay.json');
      const confirm = join(dir, 'first.json');
      writeFileSync(
        confirm,
        JSON.stringify({ keyframes: [verdict('public-profile', true)] })
      );
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
      const finding =
        "content: placeholder username 'UNMARKED.' rendered in the greeting 'Good afternoon, UNMARKED.'";
      const prompts: string[] = [];
      const falsePositiveFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        prompts.push(body.messages[0].content.at(-1).text);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: 'blocker',
                  findings: [finding],
                }),
              },
            },
          ],
        });
      };
      await main(
        ['--dir', dir, '--out', out, '--confirm-against', confirm],
        { AI_GATEWAY_API_KEY: 'k', VISUAL_REVIEW_BASE_URL: 'https://gw.test' },
        falsePositiveFetch
      );
      expect(prompts).toHaveLength(1);
      for (const prompt of prompts)
        expect(prompt).toContain('"expectedArtistName":"UNMARKED"');
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(written.keyframes[0].expectedArtistName).toBe('UNMARKED');
      expect(written.suspected).toEqual([]);
      expect(written.confirmed).toEqual([]);
      expect(written.keyframes[0].model).toEqual({
        verdict: 'pass',
        findings: [],
      });
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('exits 1 only when the replay confirms a suspected keyframe', async () => {
      const dir = setupDir(
        { ...record(), expectedArtistName: 'UNMARKED' },
        record()
      );
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
