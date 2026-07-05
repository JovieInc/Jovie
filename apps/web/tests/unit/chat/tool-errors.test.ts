import { describe, expect, it } from 'vitest';
import {
  buildToolFailure,
  classifyThrownToolError,
  isRecoverableToolStreamError,
  normalizeToolFailureOutput,
  resolveToolFailurePresentation,
  TOOL_ERROR_CODES,
} from '@/lib/chat/tool-errors';

describe('tool-errors', () => {
  it('maps unprovisioned failures to TOOL_UNPROVISIONED copy', () => {
    const presentation = resolveToolFailurePresentation({
      toolName: 'retouchImage',
      errorCode: TOOL_ERROR_CODES.TOOL_UNPROVISIONED,
      errorMessage: 'Retouch is not provisioned for this account.',
    });

    expect(presentation.errorCode).toBe('TOOL_UNPROVISIONED');
    expect(presentation.body).toContain('not provisioned');
    expect(presentation.nextStep).toContain('workaround');
  });

  it('normalizes legacy tool failure payloads with inferred codes', () => {
    const normalized = normalizeToolFailureOutput('generateAlbumArt', {
      success: false,
      error: 'Album art generation requires a Pro plan.',
      retryable: false,
    });

    expect(normalized).toMatchObject({
      success: false,
      errorCode: 'PLAN_UNAVAILABLE',
      retryable: false,
    });
  });

  it('classifies thrown provider errors without rethrowing semantics', () => {
    const failure = classifyThrownToolError(
      'generateAlbumArt',
      Object.assign(new Error('XAI_API_KEY is not configured'), {
        code: 'XAI_API_KEY_MISSING',
      })
    );

    expect(failure.errorCode).toBe('PROVIDER_UNAVAILABLE');
    expect(failure.retryable).toBe(false);
  });

  it('treats recoverable tool stream errors as soft failures', () => {
    const error = Object.assign(new Error('Retouch provider unavailable'), {
      code: TOOL_ERROR_CODES.TOOL_UNPROVISIONED,
    });

    expect(isRecoverableToolStreamError(error)).toBe(true);
    expect(
      buildToolFailure({
        toolName: 'retouchImage',
        errorCode: TOOL_ERROR_CODES.TOOL_UNPROVISIONED,
      }).errorCode
    ).toBe('TOOL_UNPROVISIONED');
  });
});
