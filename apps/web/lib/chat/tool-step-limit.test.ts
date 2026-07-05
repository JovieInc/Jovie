import { stepCountIs } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  CHAT_TOOL_STEP_LIMIT_AFFORDANCE_MESSAGE,
  CHAT_TOOL_STEP_LIMIT_CONTINUE_PROMPT,
  CHAT_TOOL_STEP_LIMIT_FREE,
  CHAT_TOOL_STEP_LIMIT_PAID,
  isChatToolStepCapExhausted,
  resolveChatToolStepLimit,
} from '@/lib/chat/tool-step-limit';

describe('step-limit affordance copy', () => {
  it('exposes stable continue affordance copy', () => {
    expect(CHAT_TOOL_STEP_LIMIT_AFFORDANCE_MESSAGE).toBe(
      'I hit the step limit — continue?'
    );
    expect(CHAT_TOOL_STEP_LIMIT_CONTINUE_PROMPT).toBe('continue');
  });
});

describe('resolveChatToolStepLimit', () => {
  it('uses the paid cap when advanced tools are enabled', () => {
    expect(resolveChatToolStepLimit(true)).toBe(CHAT_TOOL_STEP_LIMIT_PAID);
  });

  it('uses the free cap when advanced tools are disabled', () => {
    expect(resolveChatToolStepLimit(false)).toBe(CHAT_TOOL_STEP_LIMIT_FREE);
  });
});

describe('isChatToolStepCapExhausted', () => {
  it('returns false when the turn ends below the cap', () => {
    expect(
      isChatToolStepCapExhausted(
        [{ toolCalls: [{ toolName: 'loopTool' }] }],
        CHAT_TOOL_STEP_LIMIT_PAID
      )
    ).toBe(false);
  });

  it('returns false when the cap is reached without pending tool calls', () => {
    const steps = Array.from({ length: CHAT_TOOL_STEP_LIMIT_PAID }, () => ({
      toolCalls: [{ toolName: 'loopTool' }],
    }));
    steps[steps.length - 1] = { toolCalls: [] };

    expect(isChatToolStepCapExhausted(steps, CHAT_TOOL_STEP_LIMIT_PAID)).toBe(
      false
    );
  });

  it('returns true when the cap is reached with pending tool calls', () => {
    const steps = Array.from({ length: CHAT_TOOL_STEP_LIMIT_FREE }, () => ({
      toolCalls: [{ toolName: 'loopTool' }],
    }));

    expect(isChatToolStepCapExhausted(steps, CHAT_TOOL_STEP_LIMIT_FREE)).toBe(
      true
    );
  });
});

describe('stepCountIs cap', () => {
  it('stops a deliberately looping tool sequence at the configured cap', () => {
    const stopWhen = stepCountIs(CHAT_TOOL_STEP_LIMIT_FREE);
    const loopingSteps = Array.from(
      { length: CHAT_TOOL_STEP_LIMIT_FREE },
      () => ({
        toolCalls: [{ toolName: 'loopTool' }],
      })
    );

    expect(stopWhen({ steps: loopingSteps as never })).toBe(true);
    expect(
      stopWhen({
        steps: loopingSteps.slice(0, CHAT_TOOL_STEP_LIMIT_FREE - 1) as never,
      })
    ).toBe(false);
  });
});
