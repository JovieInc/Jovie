import { describe, expect, it } from 'vitest';
import {
  evaluateVisualQaBreakpointChecks,
  isVisualQaBreakpointReport,
  summarizeVisualQaBreakpointReport,
} from '@/lib/agent-os/visual-qa/breakpoint-check';
import { createVisualQaBreakpoint } from '@/lib/visual-qa/breakpoints';

describe('visual-qa breakpoint checks', () => {
  it('passes when overflow is within tolerance and content is visible', () => {
    const result = evaluateVisualQaBreakpointChecks({
      breakpoint: createVisualQaBreakpoint(390),
      measurement: {
        horizontalOverflowPx: 0,
        primaryContentVisible: true,
      },
    });

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(2);
  });

  it('fails when horizontal overflow exceeds tolerance', () => {
    const result = evaluateVisualQaBreakpointChecks({
      breakpoint: createVisualQaBreakpoint(390),
      measurement: {
        horizontalOverflowPx: 12,
        primaryContentVisible: true,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.id).toBe('noHorizontalScroll');
    expect(result.checks[0]?.passed).toBe(false);
  });

  it('summarizes run-level pass/fail state', () => {
    const report = summarizeVisualQaBreakpointReport({
      runId: 'proposal-001',
      checkedAt: '2026-06-09T12:00:00.000Z',
      gitSha: 'abc123',
      surfaces: [
        {
          surfaceId: 'shell-desktop-idle',
          title: 'Shell — desktop idle',
          passed: true,
          breakpoints: [
            evaluateVisualQaBreakpointChecks({
              breakpoint: createVisualQaBreakpoint(390),
              measurement: {
                horizontalOverflowPx: 0,
                primaryContentVisible: true,
              },
            }),
          ],
        },
      ],
    });

    expect(report.passed).toBe(true);
    expect(isVisualQaBreakpointReport(report)).toBe(true);
  });
});
