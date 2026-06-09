import { describe, expect, it } from 'vitest';
import {
  parseVisualQaCaptureRequest,
  resolveVisualQaCapturePhases,
} from '@/lib/visual-qa/capture-request';

describe('visual-qa capture request', () => {
  it('defaults to both phases when phase is omitted', () => {
    const request = parseVisualQaCaptureRequest({
      runId: 'proposal-001',
    });

    expect(request.phases).toEqual(['baseline', 'after']);
    expect(request.surfaceIds).toEqual([]);
  });

  it('parses explicit phase and surface filters', () => {
    const request = parseVisualQaCaptureRequest({
      runId: 'proposal-001',
      phase: 'baseline',
      surfaces: 'shell-desktop-idle, drawer-release-open',
    });

    expect(request.phases).toEqual(['baseline']);
    expect(request.surfaceIds).toEqual([
      'shell-desktop-idle',
      'drawer-release-open',
    ]);
  });

  it('rejects invalid run ids and phases', () => {
    expect(() =>
      parseVisualQaCaptureRequest({
        runId: '../bad',
      })
    ).toThrow(/run id/i);

    expect(() =>
      parseVisualQaCaptureRequest({
        runId: 'valid-run',
        phase: 'middle',
      })
    ).toThrow(/phase/i);
  });

  it('expands both to baseline and after', () => {
    expect(resolveVisualQaCapturePhases('both')).toEqual(['baseline', 'after']);
  });
});
