import { describe, expect, it } from 'vitest';
import {
  assertPinnedFiveTurnFlow,
  loadBakeOffTestScript,
} from './validate-test-script.ts';

describe('voice-stack bake-off test script (#12768)', () => {
  it('loads and validates the pinned 5-turn script', () => {
    const script = loadBakeOffTestScript();
    expect(script.issue).toBe('JovieInc/Jovie#12768');
    expect(script.turns).toHaveLength(5);
    assertPinnedFiveTurnFlow(script);
  });

  it('requires mid-call tool invocation on turn 3', () => {
    const script = loadBakeOffTestScript();
    const turn3 = script.turns.find(t => t.turn === 3);
    expect(turn3?.expect.toolCallRequired).toBe('check_release_schedule');
    expect(turn3?.expect.mentionsDaysUntilDrop).toBe(9);
  });

  it('includes interruption turn for latency / barge-in testing', () => {
    const script = loadBakeOffTestScript();
    const turn4 = script.turns.find(t => t.turn === 4);
    expect(turn4?.interruption).toBe(true);
    expect(turn4?.expect.handlesTopicShift).toBe(true);
  });

  it('ends with explicit hangup expectation', () => {
    const script = loadBakeOffTestScript();
    const turn5 = script.turns.find(t => t.turn === 5);
    expect(turn5?.expect.hangupOrEndCall).toBe(true);
    expect(turn5?.expect.gracefulClose).toBe(true);
  });
});