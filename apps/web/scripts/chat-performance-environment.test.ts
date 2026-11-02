import { describe, expect, it } from 'vitest';
import {
  CHAT_ENVIRONMENT_MAX_SCALE,
  CHAT_ENVIRONMENT_REFERENCE_FRAME_MS,
  calibrateChatScenario,
  deriveChatEnvironmentScale,
} from './chat-performance-environment';
import { getInteractionHotPathById } from './performance-interaction-manifest';
import type { InteractionLatencySample } from './performance-interaction-report';
import { buildInteractionLatencyReport } from './performance-interaction-report';

const chatScenario = (() => {
  const scenario = getInteractionHotPathById('chat-message-round-trip');
  if (!scenario) throw new Error('Missing chat-message-round-trip scenario');
  return scenario;
})();

/**
 * The red 2026-10-17 exact-head smoke attempts (run 39058466775): five real
 * samples, first-feedback p50 148.5ms / p95 223.7ms and usable-state p95
 * 423.8ms against the unchanged 100/100/300ms budgets.
 */
const degradedRunnerSamples: InteractionLatencySample[] = [
  [121, 369],
  [122, 380],
  [148.5, 390],
  [158, 408],
  [223.7, 423.8],
].map(([firstFeedbackMs, usableStateMs], runIndex) => ({
  scenarioId: 'chat-message-round-trip',
  runIndex,
  firstFeedbackMs,
  usableStateMs,
  renderToInteractiveMs: 0,
  droppedFrameCount: 0,
}));

describe('chat environment scale derivation', () => {
  it('returns exactly 1 on a healthy 60Hz cadence', () => {
    const healthy = CHAT_ENVIRONMENT_REFERENCE_FRAME_MS;
    expect(
      deriveChatEnvironmentScale([healthy, healthy, healthy, healthy])
    ).toBe(1);
  });

  it('floors faster-than-reference cadence at 1 so calibration never tightens', () => {
    expect(deriveChatEnvironmentScale([10, 11, 12, 13])).toBe(1);
  });

  it('scales proportionally with a degraded cadence', () => {
    const degraded = CHAT_ENVIRONMENT_REFERENCE_FRAME_MS * 2;
    expect(
      deriveChatEnvironmentScale([degraded, degraded, degraded, degraded])
    ).toBe(2);
  });

  it('caps the scale so a wedged runner fails uncalibrated instead of loosening', () => {
    const wedged = CHAT_ENVIRONMENT_REFERENCE_FRAME_MS * 8;
    expect(deriveChatEnvironmentScale([wedged, wedged, wedged, wedged])).toBe(
      CHAT_ENVIRONMENT_MAX_SCALE
    );
  });

  it('uses the median gap, not the worst gap, and fails closed on empty input', () => {
    expect(deriveChatEnvironmentScale([10, 20, 30, 40])).toBe(1.5);
    expect(deriveChatEnvironmentScale([10, 25, 40])).toBe(1.5);
    expect(deriveChatEnvironmentScale([])).toBe(1);
  });

  it.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY, '17', null])(
    'rejects malformed settled frame gap %s',
    gap => {
      expect(() => deriveChatEnvironmentScale([16.7, gap as number])).toThrow(
        'Invalid settled frame gap'
      );
    }
  );
});

describe('chat scenario calibration', () => {
  it('returns identical budgets at scale 1 (healthy runners enforce the manifest)', () => {
    expect(calibrateChatScenario(chatScenario, 1).budget).toEqual(
      chatScenario.budget
    );
  });

  it('scales timing budgets and preserves count budgets and scenario identity', () => {
    const calibrated = calibrateChatScenario(chatScenario, 2.4);
    expect(calibrated.budget).toMatchObject({
      firstFeedbackP50Ms: 240,
      firstFeedbackP95Ms: 240,
      usableStateP95Ms: 720,
      renderToInteractiveP95Ms: 120,
      maxDroppedFrames: 0,
      minimumSampleCount: 5,
      targetLabel: chatScenario.budget.targetLabel,
    });
    expect(calibrated.id).toBe(chatScenario.id);
    expect(calibrated.ia).toBe(chatScenario.ia);
    expect(chatScenario.budget.firstFeedbackP95Ms).toBe(100);
  });

  it.each([0.99, 0, 2.51, 3, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects out-of-range scale %s',
    scale => {
      expect(() => calibrateChatScenario(chatScenario, scale)).toThrow(
        'Invalid chat environment scale'
      );
    }
  );

  it('leaves undeclared optional timing budgets undeclared on non-chat scenarios', () => {
    const palette = getInteractionHotPathById('command-palette-open');
    if (!palette) throw new Error('Missing command-palette-open scenario');
    const calibrated = calibrateChatScenario(palette, 2);
    expect(calibrated.budget).toEqual({
      firstFeedbackP95Ms: 200,
      usableStateP95Ms: 200,
      targetLabel: palette.budget.targetLabel,
    });
  });
});

describe('calibrated ratchet scoring against the red smoke evidence', () => {
  it('fails the degraded-runner samples against the unchanged manifest budgets', () => {
    const report = buildInteractionLatencyReport({
      samples: degradedRunnerSamples,
      scenarios: [chatScenario],
    });
    expect(report.summaries[0]).toMatchObject({
      p50FirstFeedbackMs: 148.5,
      p95FirstFeedbackMs: 223.7,
      passed: false,
    });
    expect(report.status).toBe('fail');
  });

  it('passes the same samples on the same degraded runner once budgets are calibrated', () => {
    const report = buildInteractionLatencyReport({
      samples: degradedRunnerSamples,
      scenarios: [calibrateChatScenario(chatScenario, 2.4)],
    });
    expect(report.status).toBe('pass');
  });

  it('still fails those samples on a healthy runner (calibration is environment-gated)', () => {
    const report = buildInteractionLatencyReport({
      samples: degradedRunnerSamples,
      scenarios: [calibrateChatScenario(chatScenario, 1)],
    });
    expect(report.status).toBe('fail');
  });

  it('still catches a real feedback regression on the degraded runner', () => {
    // +120ms feedback on every sample breaches the calibrated p50 budget
    // (268.5 > 240) today, and the calibrated p95 budget (343.7 > 240) once
    // JOV-8717 lands independent feedback-tail enforcement.
    const regressed = degradedRunnerSamples.map(sample => ({
      ...sample,
      firstFeedbackMs: sample.firstFeedbackMs + 120,
    }));
    const report = buildInteractionLatencyReport({
      samples: regressed,
      scenarios: [calibrateChatScenario(chatScenario, 2.4)],
    });
    expect(report.summaries[0]?.p50FirstFeedbackMs).toBeGreaterThan(240);
    expect(report.status).toBe('fail');
  });
});
