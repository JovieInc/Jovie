import { describe, expect, it } from 'vitest';
import {
  classifyActionIntent,
  endsWithAsk,
  isTurnOutcomeFailure,
  judgeTurnOutcome,
  type TurnToolEvent,
} from './turn-outcome';

const merchStallReply =
  'Merch is started using your track "Save the Night" as the source, the top match from your catalog. It\'s set up as a premium tee and I can switch the product later. The concepts are waiting on review before any artwork generates, so nothing has been produced yet. Pick a direction or a different source title: "Save the Night" suggests a nocturnal, city-lights visual system, or I can rerun it against "All This Noise EP" or "Become One". Tell me which title and any visual direction, and I\'ll generate the three designs.';

const emptyMerch: TurnToolEvent = {
  toolName: 'createMerch',
  state: 'succeeded',
  output: {
    success: true,
    state: 'concept_review_required',
    designs: [],
  },
};

const threeDesigns: TurnToolEvent = {
  toolName: 'createMerch',
  state: 'succeeded',
  output: { success: true, designs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
};

describe('classifyActionIntent', () => {
  it.each([
    ['make merch', 'merch'],
    ['merch', 'merch'],
    ['can you design a tee for my new single', 'merch'],
    ['create a task', 'task'],
    ['add a to-do to send stems', 'task'],
    ['set up a release for Friday', 'release'],
    ['write a bio', 'bio'],
    ['update my bio', 'bio'],
  ])('%s -> %s', (prompt, intent) => {
    expect(classifyActionIntent(prompt)).toBe(intent);
  });

  it.each(['hi', 'stream', 'how are my streams', 'what is merch worth'])(
    '%s is not an action ask',
    prompt => {
      expect(classifyActionIntent(prompt)).toBeNull();
    }
  );
});

describe('judgeTurnOutcome: transcripts from staging, Nov 22', () => {
  it('fails "make merch" when the tool returns zero designs (the review-gate stall)', () => {
    const outcome = judgeTurnOutcome({
      userText: 'make merch',
      assistantText: merchStallReply,
      toolEvents: [
        { toolName: 'findMerchSources', state: 'succeeded', output: {} },
        emptyMerch,
      ],
    });
    expect(outcome.verdict).toBe('empty-outcome');
    expect(isTurnOutcomeFailure(outcome)).toBe(true);
    expect(outcome.reasons).toContain('action.empty_outcome:createMerch');
  });

  it('fails "make merch" when chat asks for a direction without calling the generator', () => {
    const outcome = judgeTurnOutcome({
      userText: 'make merch',
      assistantText:
        'Which track should the tee be built around, and do you want a nocturnal or neon direction?',
      toolEvents: [
        { toolName: 'findMerchSources', state: 'succeeded', output: {} },
      ],
    });
    expect(outcome.verdict).toBe('stalled');
    expect(outcome.reasons).toEqual(
      expect.arrayContaining([
        'action.not_called:merch',
        'reply.asked_instead_of_acting',
      ])
    );
  });

  it('passes "make merch" when three designs render', () => {
    const outcome = judgeTurnOutcome({
      userText: 'make merch',
      assistantText:
        'Three tees from "Save the Night" are ready below. Pick one to put on your profile.',
      toolEvents: [threeDesigns],
    });
    expect(outcome.verdict).toBe('acted');
    expect(isTurnOutcomeFailure(outcome)).toBe(false);
  });

  it('passes "make merch" when the stored output was truncated for size', () => {
    const outcome = judgeTurnOutcome({
      userText: 'make merch',
      assistantText: 'Three tees are ready below.',
      toolEvents: [
        {
          toolName: 'createMerch',
          state: 'succeeded',
          output: { success: true, truncated: true, summary: 'ok' },
        },
      ],
    });
    expect(outcome.verdict).toBe('acted');
  });

  it('passes "create a task" when the task is written, but flags the trailing ask', () => {
    const outcome = judgeTurnOutcome({
      userText: 'create a task',
      assistantText:
        'Task created: "Review Save the Night merch design direction" (task 190). It\'s in your Tasks workspace now. Your next move: give me the visual direction for the Save the Night tee, for example nocturnal skyline or neon nightlife, and I\'ll generate the three design options so you can pick one and get it live.',
      toolEvents: [
        {
          toolName: 'manageTasks',
          state: 'succeeded',
          input: { intent: 'create', title: 'Review merch' },
          output: { success: true, intent: 'create' },
        },
      ],
    });
    expect(outcome.verdict).toBe('acted');
    expect(outcome.reasons).toContain('reply.trailing_ask');
  });

  it('fails "create a task" when chat only opens the tasks page', () => {
    const outcome = judgeTurnOutcome({
      userText: 'create a task',
      assistantText: 'What should the task be called?',
      toolEvents: [
        {
          toolName: 'manageTasks',
          state: 'succeeded',
          input: { intent: 'open' },
          output: { success: true, intent: 'open' },
        },
      ],
    });
    expect(outcome.verdict).toBe('empty-outcome');
  });

  it('fails "write a bio" when chat asks for a press kit instead of drafting', () => {
    const outcome = judgeTurnOutcome({
      userText: 'write a bio',
      assistantText:
        'I can draft one from your pop/electronic catalog. Want me to write it, or do you have a press kit or site URL I should import it from?',
      toolEvents: [],
    });
    expect(outcome.verdict).toBe('stalled');
  });

  it('fails a failed release tool', () => {
    const outcome = judgeTurnOutcome({
      userText: 'set up a release for my next single',
      assistantText: 'Something went wrong setting that up.',
      toolEvents: [
        {
          toolName: 'createRelease',
          state: 'failed',
          output: { success: false },
        },
      ],
    });
    expect(outcome.verdict).toBe('stalled');
    expect(outcome.reasons).toContain('action.failed:createRelease');
  });

  it('accepts one short title question for a release with no title', () => {
    const outcome = judgeTurnOutcome({
      userText: 'set up a release',
      assistantText: 'What is the next single called?',
      toolEvents: [],
    });
    expect(outcome.verdict).toBe('needs-input');
    expect(isTurnOutcomeFailure(outcome)).toBe(false);
  });

  it('does not judge a non-action turn, but still measures length', () => {
    const outcome = judgeTurnOutcome({
      userText: 'stream',
      assistantText: `${'word '.repeat(120)}Which track is coming next?`,
      toolEvents: [],
    });
    expect(outcome.verdict).toBe('not-applicable');
    expect(outcome.trailingAsk).toBe(true);
    expect(outcome.reasons[0]).toMatch(/^reply\.over_budget:/);
  });
});

describe('endsWithAsk', () => {
  it('ignores a question early in a reply that ends on a statement', () => {
    expect(
      endsWithAsk(
        'Want a darker look? I went with the neon one. Three tees are ready below.'
      )
    ).toBe(false);
  });
});
