import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CopyBrief,
  excludeGeneratorFamily,
  gateCopy,
  gatewayTransport,
  type JudgeTransport,
  modelFamily,
  selectJudges,
  writeUntilPass,
} from './judge';

const brief: CopyBrief = {
  register: 'jovie-marketing',
  tier: 'flagship',
  audience: 'independent artists',
  goal: 'claim a profile',
  facts: ['One profile link works across every platform.'],
};

const judgeReturning =
  (scoresByFamily: Record<string, number>, confidence = 0.9): JudgeTransport =>
  async ({ model }) => {
    const score = scoresByFamily[model.split('/')[0] ?? ''] ?? 9;
    return JSON.stringify({
      scores: {
        outcome: score,
        specificity: score,
        economy: score,
        voice: score,
        truth: score,
        safety: score,
        human: score,
      },
      confidence,
      critique: score < 8 ? [`${model}: be specific`] : [],
    });
  };

describe('tiered judge panel', () => {
  it('never lets the generator family judge itself', () => {
    expect(
      selectJudges('flagship', 'anthropic/claude-opus-5.5')
    ).not.toContainEqual(expect.stringMatching(/^anthropic\//));
    expect(selectJudges('standard', 'zai/glm-5.3-flash')[0]).not.toMatch(
      /^zai\//
    );
  });

  it('excludeGeneratorFamily keeps order and drops the generator family and unreachable models', () => {
    const roster = ['anthropic/a', 'openai/b', 'zai/c', 'openai/d'];
    expect(excludeGeneratorFamily(roster, 'openai/x')).toEqual([
      'anthropic/a',
      'zai/c',
    ]);
    expect(
      excludeGeneratorFamily(roster, undefined, model => model !== 'zai/c')
    ).toEqual(['anthropic/a', 'openai/b', 'openai/d']);
    expect(modelFamily('anthropic/claude-opus-5.5')).toBe('anthropic');
  });

  it('an unseatable panel blocks instead of passing', async () => {
    const onlyZai: JudgeTransport = Object.assign(judgeReturning({}), {
      available: (model: string) => model.startsWith('zai/'),
    });
    const result = await gateCopy(
      'One link for every fan.',
      { ...brief, generatorModel: 'anthropic/claude-opus-5.5' },
      onlyZai
    );
    expect(result.status).toBe('blocked');
    expect(result.critique[0]).toMatch(/panel unavailable/);
    expect((await gateCopy('One link for every fan.', brief)).status).toBe(
      'blocked'
    );
    const loop = await writeUntilPass(
      brief,
      async () => 'One link for every fan.'
    );
    expect(loop).toMatchObject({ status: 'blocked', rounds: 1 });
  });

  it('gateway transport only claims allowlisted families', () => {
    const gateway = gatewayTransport('key');
    expect(gateway.available?.('zai/glm-5.3')).toBe(true);
    expect(gateway.available?.('anthropic/claude-opus-5.5')).toBe(false);
  });

  it('volume tier spends zero tokens', async () => {
    let calls = 0;
    const result = await gateCopy(
      'Your profile is ready to share.',
      { ...brief, tier: 'volume' },
      async () => {
        calls++;
        return '{}';
      }
    );
    expect(result.status).toBe('pass');
    expect(calls).toBe(0);
  });

  it('deterministic block short-circuits before any judge call', async () => {
    let calls = 0;
    const result = await gateCopy('Guaranteed streams.', brief, async () => {
      calls++;
      return '{}';
    });
    expect(result.status).toBe('revise');
    expect(calls).toBe(0);
  });

  it('majority passes flagship', async () => {
    const result = await gateCopy(
      'One link for every fan.',
      brief,
      judgeReturning({ zai: 6 }, 0.5)
    );
    expect(result.status).toBe('pass');
  });

  it('one confident truth or safety failure blocks even a majority', async () => {
    const result = await gateCopy(
      'One link for every fan.',
      brief,
      judgeReturning({ zai: 4 }, 0.9)
    );
    expect(result.status).toBe('revise');
  });

  it('judge errors and missing scores fail closed', async () => {
    const result = await gateCopy(
      'One link for every fan.',
      brief,
      async () => {
        throw new Error('timeout');
      }
    );
    expect(result.status).toBe('revise');
    const partial = await gateCopy(
      'One link for every fan.',
      brief,
      async () => '{"scores":{"outcome":10},"confidence":1}'
    );
    expect(partial.status).toBe('revise');
  });

  it('rewrite loop feeds critique back and blocks when rounds run out', async () => {
    const drafts = ['Guaranteed streams.', 'One link for every fan.'];
    const passed = await writeUntilPass(
      brief,
      async ({ round }) => drafts[round - 1] ?? '',
      judgeReturning({})
    );
    expect(passed).toMatchObject({ status: 'pass', rounds: 2 });

    const seen: (readonly string[])[] = [];
    const blocked = await writeUntilPass(
      { ...brief, tier: 'standard' },
      async ({ critique }) => {
        seen.push(critique);
        return 'Buy streams now.';
      }
    );
    expect(blocked.status).toBe('blocked');
    expect(seen[1]?.[0]).toMatch(/artificial-engagement/);
  });
});

describe('gateway request policy', () => {
  afterEach(() => vi.unstubAllGlobals());

  const request = {
    model: 'zai/glm-5.3',
    system: 'judge',
    prompt: 'copy',
  };
  const allowed = (model: string) => model === request.model;
  const reply = () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));

  it('awaits authorization before sending its token cap and single provider', async () => {
    const fetch = vi.fn(async () => reply());
    vi.stubGlobal('fetch', fetch);
    let release!: (value: { maxTokens: number; provider: string }) => void;
    const authorize = vi.fn(
      () =>
        new Promise<{ maxTokens: number; provider: string }>(resolve => {
          release = resolve;
        })
    );
    const send = gatewayTransport('key', 'https://gateway.example/v1', {
      allowed,
      authorize,
    });
    expect(send.available?.(request.model)).toBe(true);
    expect(authorize).not.toHaveBeenCalled();
    const pending = send(request);
    expect(authorize).toHaveBeenCalledWith(request);
    expect(fetch).not.toHaveBeenCalled();
    release({ maxTokens: 512, provider: 'zai' });
    await expect(pending).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://gateway.example/v1/chat/completions');
    expect(JSON.parse(options.body as string)).toEqual({
      model: request.model,
      temperature: 0,
      max_tokens: 512,
      providerOptions: { gateway: { only: ['zai'] } },
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
    });
  });

  it('rejects an unknown model before authorization or fetch', async () => {
    const fetch = vi.fn();
    const authorize = vi.fn(async () => ({ maxTokens: 512, provider: 'zai' }));
    vi.stubGlobal('fetch', fetch);
    const send = gatewayTransport('key', undefined, { allowed, authorize });
    expect(send.available?.('zai/unknown')).toBe(false);
    await expect(send({ ...request, model: 'zai/unknown' })).rejects.toThrow(
      /not allowed/
    );
    expect(authorize).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never fetches when authorization rejects', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const authorize = vi.fn(async () => {
      throw new Error('budget exhausted');
    });
    await expect(
      gatewayTransport('key', undefined, { allowed, authorize })(request)
    ).rejects.toThrow('budget exhausted');
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid token cap %s before fetch', async maxTokens => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const send = gatewayTransport('key', undefined, {
      allowed,
      authorize: async () => ({ maxTokens, provider: 'zai' }),
    });
    await expect(send(request)).rejects.toThrow(/maxTokens/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['', '  ', ' zai '])(
    'rejects invalid provider %j before fetch',
    async provider => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const send = gatewayTransport('key', undefined, {
        allowed,
        authorize: async () => ({ maxTokens: 512, provider }),
      });
      await expect(send(request)).rejects.toThrow(/provider/);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each(['openai/gpt-5.5', 'anthropic/claude-opus-5.5', 'unknown/model'])(
    'enforces the gateway family restriction on send for %s',
    async model => {
      const fetch = vi.fn();
      const authorize = vi.fn(async () => ({
        maxTokens: 512,
        provider: 'zai',
      }));
      vi.stubGlobal('fetch', fetch);
      await expect(
        gatewayTransport('key')({ ...request, model })
      ).rejects.toThrow(/not allowed/);
      await expect(
        gatewayTransport('key', undefined, { allowed: () => true, authorize })({
          ...request,
          model,
        })
      ).rejects.toThrow(/not allowed/);
      expect(authorize).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('keeps the unconfigured request shape for existing callers', async () => {
    const fetch = vi.fn(async () => reply());
    vi.stubGlobal('fetch', fetch);
    await expect(gatewayTransport('key')(request)).resolves.toBe('ok');
    const [, options] = fetch.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(options.body as string);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('providerOptions');
  });

  it.each([
    { finishReason: 'length', error: undefined, expected: /truncated/ },
    {
      finishReason: 'stop',
      error: { message: 'provider failed' },
      expected: /error payload/,
    },
  ])(
    'rejects an incomplete or failed protected response without retrying or releasing its reservation',
    async ({ finishReason, error, expected }) => {
      const fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              // Parseable content must not conceal a truncated or errored response.
              choices: [
                {
                  finish_reason: finishReason,
                  message: { content: '{"score":0.9}' },
                },
              ],
              ...(error ? { error } : {}),
            })
          )
      );
      vi.stubGlobal('fetch', fetch);
      let reservedTokens = 0;
      const authorize = vi.fn(async () => {
        reservedTokens += 512;
        return { maxTokens: 512, provider: 'zai' };
      });
      await expect(
        gatewayTransport('key', undefined, { allowed, authorize })(request)
      ).rejects.toThrow(expected);
      expect(authorize).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(reservedTokens).toBe(512);
    }
  );

  it.each(['http', 'network'])('does not retry a %s failure', async failure => {
    const fetch = vi.fn(async () => {
      if (failure === 'network') throw new Error('network unavailable');
      return new Response('unavailable', { status: 503 });
    });
    vi.stubGlobal('fetch', fetch);
    const authorize = vi.fn(async () => ({ maxTokens: 512, provider: 'zai' }));
    await expect(
      gatewayTransport('key', undefined, { allowed, authorize })(request)
    ).rejects.toThrow(
      failure === 'network' ? 'network unavailable' : 'gateway 503'
    );
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
