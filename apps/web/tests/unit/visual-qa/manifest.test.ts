import { describe, expect, it } from 'vitest';
import { isVisualQaRunManifest } from '@/lib/visual-qa/types';

describe('visual-qa manifest', () => {
  it('accepts a valid run manifest shape', () => {
    expect(
      isVisualQaRunManifest({
        runId: 'proposal-001',
        createdAt: '2026-06-08T12:00:00.000Z',
        updatedAt: '2026-06-08T12:05:00.000Z',
        gitSha: 'abc123',
        surfaces: [
          {
            surfaceId: 'shell-desktop-idle',
            title: 'Shell — desktop idle',
            baselinePath: 'proposal-001/shell-desktop-idle/baseline.png',
            afterPath: 'proposal-001/shell-desktop-idle/after.png',
            baselineCapturedAt: '2026-06-08T12:00:00.000Z',
            afterCapturedAt: '2026-06-08T12:05:00.000Z',
            viewport: { width: 1440, height: 900 },
          },
        ],
      })
    ).toBe(true);
  });

  it('rejects malformed manifests', () => {
    expect(isVisualQaRunManifest(null)).toBe(false);
    expect(
      isVisualQaRunManifest({
        runId: 'proposal-001',
        createdAt: '2026-06-08T12:00:00.000Z',
        updatedAt: '2026-06-08T12:05:00.000Z',
        gitSha: null,
        surfaces: [],
      })
    ).toBe(true);
    expect(
      isVisualQaRunManifest({
        runId: 'proposal-001',
        surfaces: [{ surfaceId: 'shell-desktop-idle' }],
      })
    ).toBe(false);
  });
});
