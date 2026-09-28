import { describe, expect, it } from 'vitest';
import {
  type CopyBrief,
  gateCopy,
  gatewayTransport,
  type JudgeTransport,
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
