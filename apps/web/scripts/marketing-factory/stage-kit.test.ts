import { describe, expect, it } from 'vitest';
import { loadFactoryBrief } from './brief';
import { dryProviders, fixtureTransport } from './providers';
import {
  type DirectionRecord,
  judge,
  pickDirection,
  type StageContext,
} from './stage-kit';

const brief = loadFactoryBrief('solutions', 'founders');
const unsupportedClaim = 'Double your income in seven days';

function review(reply: unknown) {
  const ctx: StageContext = {
    pageId: 'solutions-founders',
    brief,
    providers: dryProviders(brief, {
      selectJudges: () => ['openai/gpt-5.5', 'zai/glm-5.1'],
      transport: fixtureTransport(({ model }) =>
        JSON.stringify(
          model.startsWith('openai/')
            ? reply
            : {
                score: 0.8,
                verdict: 'pass',
                critique: [],
                unsupportedClaims: [],
              }
        )
      ),
    }),
    artifacts: {},
    receipts: {},
    attempt: 1,
    feedback: [],
    runDir: '/unused-factory-judge-test',
  };
  return judge(ctx, {
    rubric: 'outcomes',
    tier: 'flagship',
    producerModel: 'anthropic/claude-opus-5.5',
    instruction: 'Check each outcome against its supplied claims.',
    subject: { outcomes: [{ statement: unsupportedClaim }] },
  });
}

describe('judge claim findings', () => {
  it('vetoes a high-scoring pass and retains its findings for retry feedback', async () => {
    const result = await review({
      score: 0.9,
      verdict: 'pass',
      critique: [],
      unsupportedClaims: [` ${unsupportedClaim} `, unsupportedClaim],
    });

    expect(result.evaluators.map(e => e.verdict)).toEqual(['fail', 'pass']);
    expect(result.evaluators[0].score).toBe(0.9);
    expect(result.unsupportedClaims).toEqual([unsupportedClaim]);
    expect(result.critique).toEqual(
      expect.arrayContaining([expect.stringContaining(unsupportedClaim)])
    );
    expect(result.unavailable).toBeNull();
  });

  it.each(['pass', 'revise', 'fail'])(
    'preserves an explicit %s with no unsupported claims',
    async verdict => {
      const result = await review({
        score: 0.7,
        verdict,
        critique: ['Keep this review feedback'],
        unsupportedClaims: [],
      });

      expect(result.evaluators[0]).toMatchObject({ verdict, score: 0.7 });
      expect(result.critique).toEqual(['Keep this review feedback']);
      expect(result.unsupportedClaims).toEqual([]);
    }
  );

  it.each([
    { label: 'missing', reply: {} },
    { label: 'null', reply: { unsupportedClaims: null } },
    { label: 'string', reply: { unsupportedClaims: unsupportedClaim } },
    { label: 'object', reply: { unsupportedClaims: {} } },
    { label: 'blank entry', reply: { unsupportedClaims: ['  '] } },
    { label: 'number entry', reply: { unsupportedClaims: [1] } },
    { label: 'null entry', reply: { unsupportedClaims: [null] } },
    { label: 'object entry', reply: { unsupportedClaims: [{}] } },
  ])(
    'fails a $label findings list with diagnostic feedback',
    async ({ reply }) => {
      const result = await review({
        score: 0.9,
        verdict: 'pass',
        critique: [],
        ...reply,
      });

      expect(result.evaluators[0].verdict).toBe('fail');
      expect(result.critique.join(' ')).toMatch(/unsupportedClaims/);
      expect(result.unsupportedClaims).toEqual([]);
      expect(result.unavailable).toBeNull();
    }
  );

  it('keeps valid findings when another list entry is malformed', async () => {
    const result = await review({
      score: 0.9,
      verdict: 'pass',
      critique: ['Check the evidence'],
      unsupportedClaims: [unsupportedClaim, null],
    });

    expect(result.evaluators[0].verdict).toBe('fail');
    expect(result.unsupportedClaims).toEqual([unsupportedClaim]);
    expect(result.critique).toEqual(
      expect.arrayContaining([
        'Check the evidence',
        expect.stringContaining(unsupportedClaim),
        expect.stringMatching(/unsupportedClaims/),
      ])
    );
  });

  it.each([null, 1, 'not a judge reply'])(
    'records a reply without a JSON object as a failed review: %j',
    async reply => {
      const result = await review(reply);

      expect(result.evaluators[0].verdict).toBe('fail');
      expect(result.critique.length).toBeGreaterThan(0);
      expect(result.unsupportedClaims).toEqual([]);
      expect(result.unavailable).toBeNull();
    }
  );
});

const direction = (
  index: number,
  passed: boolean,
  score: number
): DirectionRecord => ({
  direction: index,
  outputDigest: `sha256:${index}`,
  passed,
  score,
  invariantsFailed: passed ? [] : ['copy-no-em-dash'],
  evaluators: [],
});

describe('pickDirection', () => {
  it('picks the highest-scoring passing direction over a higher failing one', () => {
    const winner = pickDirection([
      direction(1, false, 0.95),
      direction(2, true, 0.7),
      direction(3, true, 0.8),
    ]);

    expect(winner.direction).toBe(3);
    expect(winner.rationale).toMatch(/direction 3 passed .* 0\.80/);
    expect(winner.rationale).toMatch(/highest of 2 passing/);
    expect(winner.rationale).toMatch(/1 \(failed, 0\.95\)/);
  });

  it('refines the best failing direction when none passed', () => {
    const winner = pickDirection([
      direction(1, false, 0.4),
      direction(2, false, 0.6),
    ]);

    expect(winner.direction).toBe(2);
    expect(winner.rationale).toMatch(/none passed/);
  });
});
