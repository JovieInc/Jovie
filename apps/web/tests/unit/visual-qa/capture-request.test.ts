import { describe, expect, it } from 'vitest';
import {
  parseVisualQaCaptureRequest,
  resolveVisualQaCapturePhases,
} from '@/lib/visual-qa/capture-request';

describe('visual-qa capture request', () => {
  it('defaults to both phases and themes when omitted', () => {
    const request = parseVisualQaCaptureRequest({
      runId: 'proposal-001',
    });

    expect(request.phases).toEqual(['baseline', 'after']);
    expect(request.themes).toEqual(['dark', 'light']);
    expect(request.surfaceIds).toEqual([]);
  });

  it('parses explicit phase, theme, and surface filters', () => {
    const request = parseVisualQaCaptureRequest({
      runId: 'proposal-001',
      phase: 'baseline',
      themes: 'dark',
      surfaces: 'shell-desktop-idle, drawer-release-open',
    });

    expect(request.phases).toEqual(['baseline']);
    expect(request.themes).toEqual(['dark']);
    expect(request.surfaceIds).toEqual([
      'shell-desktop-idle',
      'drawer-release-open',
    ]);
  });

  it('rejects invalid run ids, phases, and themes', () => {
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

    expect(() =>
      parseVisualQaCaptureRequest({
        runId: 'valid-run',
        themes: 'sepia',
      })
    ).toThrow(/theme/i);
  });

  it('expands both to baseline and after', () => {
    expect(resolveVisualQaCapturePhases('both')).toEqual(['baseline', 'after']);
  });
});
