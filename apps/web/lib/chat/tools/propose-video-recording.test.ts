import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/server', () => ({
  getTeleprompterShowcaseVariant: vi.fn(async () => 'direct'),
}));

import { createProposeVideoRecordingTool } from './propose-video-recording';

type Execute = (
  input: Record<string, unknown>,
  options: Record<string, unknown>
) => Promise<Record<string, unknown>>;

function execute(input: Record<string, unknown>) {
  const tool = createProposeVideoRecordingTool({ clerkUserId: 'user_1' });
  return (tool.execute as unknown as Execute)(input, {
    toolCallId: 'call_1',
    messages: [],
  });
}

describe('createProposeVideoRecordingTool', () => {
  it('trims the script and passes the interview questions on', async () => {
    const result = await execute({
      kind: 'promo',
      title: ' Release day shout-out ',
      script: '  Tonight I play it live for the first time.  ',
      questions: [' Where did you write it? '],
    });

    expect(result).toMatchObject({
      success: true,
      kind: 'promo',
      title: 'Release day shout-out',
      script: 'Tonight I play it live for the first time.',
      showcaseVariant: 'direct',
      questions: ['Where did you write it?'],
      label: 'Promo video',
    });
  });

  it('leaves questions off when none are given', async () => {
    const result = await execute({
      kind: 'thank_you',
      title: 'Thank you',
      script: 'Thank you for every stream this week.',
      questions: [],
    });

    expect(result).not.toHaveProperty('questions');
    expect(result.label).toBe('Thank-you video');
  });
});
