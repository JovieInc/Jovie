import { describe, expect, it } from 'vitest';
import { normalizeToolFailureOutput } from '@/lib/chat/tool-errors';

describe('createMerch failure payload normalization', () => {
  it('preserves generationId and failureSummary when a merch failure payload is normalized', () => {
    const payload = normalizeToolFailureOutput('createMerch', {
      success: false,
      error: 'Profile ID required',
      generationId: 'gen-1',
      failureSummary: {
        requested: 3,
        ready: 0,
        byClass: { image_provider: 3 },
      },
    });

    expect(payload).not.toBeNull();
    expect((payload as { generationId?: string }).generationId).toBe('gen-1');
    expect((payload as { failureSummary?: unknown }).failureSummary).toEqual({
      requested: 3,
      ready: 0,
      byClass: { image_provider: 3 },
    });
  });
});
