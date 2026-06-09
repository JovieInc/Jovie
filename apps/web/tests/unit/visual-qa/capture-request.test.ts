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
    expect(request.breakpoints.map(breakpoint => breakpoint.width)).toEqual([
      320, 360, 375, 390, 414, 768, 820, 1024, 1280, 1440, 1536,
    ]);
  });

  it('parses explicit phase and surface filters', () => {
    const request = parseVisualQaCaptureRequest({
      runId: 'proposal-001',
      phase: 'baseline',
      surfaces: 'shell-desktop-idle, drawer-release-open',
      breakpoints: '390,768,1440',
    });

    expect(request.phases).toEqual(['baseline']);
    expect(request.surfaceIds).toEqual([
      'shell-desktop-idle',
      'drawer-release-open',
    ]);
    expect(request.breakpoints.map(breakpoint => breakpoint.width)).toEqual([
      390, 768, 1440,
    ]);
  });

  it('parses compact breakpoint presets', () => {
    const request = parseVisualQaCaptureRequest({
      runId: 'proposal-001',
      breakpoints: 'compact',
    });

    expect(request.breakpoints.map(breakpoint => breakpoint.width)).toEqual([
      320, 360, 375, 390, 414,
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
