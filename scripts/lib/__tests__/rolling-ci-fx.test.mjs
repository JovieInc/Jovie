import { describe, expect, it } from 'vitest';
import {
  buildFxRepairPrompt,
  cursorAuthHeader,
  findOwnedFxAgents,
  planFxCursorLaunch,
} from '../rolling-ci-fx.mjs';

const head = 'a'.repeat(40);

describe('FX Cursor-direct launch planner', () => {
  it('fails closed without CURSOR_API_KEY', () => {
    expect(
      planFxCursorLaunch({
        cursorApiKey: '',
        fingerprint: 'ci:abc',
      })
    ).toMatchObject({
      action: 'fail_closed',
      reason: 'missing_cursor_api_key',
    });
  });

  it('dedups an already-owned fingerprint and encodes Basic auth', () => {
    expect(
      findOwnedFxAgents([{ id: 'bc-1', prompt: 'ci:abc' }], 'ci:abc')
    ).toEqual(['bc-1']);
    expect(cursorAuthHeader('key')).toBe(
      `Basic ${Buffer.from('key:', 'utf8').toString('base64')}`
    );
    expect(
      planFxCursorLaunch({
        cursorApiKey: 'key',
        existingAgentIds: ['bc-1'],
        fingerprint: 'ci:abc',
      })
    ).toMatchObject({ action: 'dedup', existingAgentIds: ['bc-1'] });
  });

  it('repairs the current PR branch without opening a second PR', () => {
    const plan = planFxCursorLaunch({
      cursorApiKey: 'key',
      repository: 'JovieInc/Jovie',
      pr: 5285,
      head,
      branch: 'fallback/JOV-5285-fix',
      check: 'ci-fast',
      fingerprint: 'ci:typecheck',
      failedSteps: ['Typecheck'],
      eventName: 'check_run',
    });
    expect(plan.action).toBe('launch');
    expect(plan.request.source).toEqual({
      repository: 'https://github.com/JovieInc/Jovie',
      ref: 'fallback/JOV-5285-fix',
    });
    expect(plan.request.target.autoCreatePr).toBe(false);
    const prompt = buildFxRepairPrompt({
      repository: 'JovieInc/Jovie',
      pr: 5285,
      head,
      branch: 'fallback/JOV-5285-fix',
      check: 'ci-fast',
      fingerprint: 'ci:typecheck',
      failedSteps: ['Typecheck'],
      eventName: 'check_suite',
    });
    expect(prompt).toContain('Do not open a second PR');
    expect(prompt).toContain('Draft PRs are in scope');
    expect(prompt).toContain('Do not add the queue-deferred label');
  });
});
