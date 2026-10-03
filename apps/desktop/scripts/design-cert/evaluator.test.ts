import { describe, expect, it } from 'vitest';
import {
  type DesktopCaptureObservation,
  evaluateDesktopCapture,
} from './evaluator';

function observation(
  overrides: Partial<DesktopCaptureObservation> = {}
): DesktopCaptureObservation {
  return {
    stateId: 'desktop.ovie.metrics-unavailable',
    processAlive: true,
    windowFound: true,
    windowOnScreen: true,
    windowBounds: { width: 1512, height: 949, x: 0, y: 33 },
    screenshotFrameValid: true,
    pixelStats: {
      width: 1440,
      height: 900,
      entropy: 2.4,
      meanLuma: 24,
      maxChannelStdDev: 38,
    },
    elements: [
      { role: 'AXHeading', label: 'Ovie', in_web_content: true },
      { role: 'AXStaticText', label: 'Default Alive', in_web_content: true },
      {
        role: 'AXStaticText',
        label: 'Week-over-week Growth',
        in_web_content: true,
      },
      { role: 'AXStaticText', label: 'Active Users', in_web_content: true },
      { role: 'AXStaticText', label: '—', in_web_content: true },
      {
        role: 'AXStaticText',
        label:
          'Revenue and active-user inputs are unavailable. Reload Jovie to retry.',
        in_web_content: true,
      },
      {
        role: 'AXStaticText',
        label: 'Shipping Throughput',
        in_web_content: true,
      },
      { role: 'AXLink', label: 'Back to Jovie', in_web_content: true },
      { role: 'AXLink', label: 'Chat', in_web_content: true },
      { role: 'AXLink', label: 'Ops', in_web_content: true },
      { role: 'AXLink', label: 'People', in_web_content: true },
    ],
    ...overrides,
  };
}

describe('desktop design certification evaluator', () => {
  it('passes a truthful, nonblank, recoverable unavailable Ovie state', () => {
    expect(evaluateDesktopCapture(observation())).toMatchObject({
      outcome: 'pass',
      failures: [],
      instrumentationBlockers: [],
    });
  });

  it('fails when unavailable growth is presented as zero with a YC verdict', () => {
    const result = evaluateDesktopCapture(
      observation({
        elements: [
          ...observation().elements.flatMap(element =>
            element.label === 'Active Users'
              ? [
                  element,
                  { role: 'AXStaticText', label: '0', in_web_content: true },
                ]
              : [element]
          ),
          {
            role: 'AXStaticText',
            label: '1% means not figured out',
            in_web_content: true,
          },
        ],
      })
    );

    expect(result.outcome).toBe('fail');
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invariant: 'truthful-state',
          evidence: expect.stringMatching(/Unknown active users rendered as 0/),
        }),
      ])
    );
  });

  it('does not confuse a zero shipping count with unavailable active users', () => {
    const result = evaluateDesktopCapture(
      observation({
        elements: [
          ...observation().elements,
          { role: 'AXStaticText', label: '0', in_web_content: true },
        ],
      })
    );

    expect(result).toMatchObject({ outcome: 'pass', failures: [] });
  });

  it('fails closed on a near-solid screenshot', () => {
    const result = evaluateDesktopCapture(
      observation({
        pixelStats: {
          width: 1440,
          height: 900,
          entropy: 0.01,
          meanLuma: 0.4,
          maxChannelStdDev: 0.5,
        },
      })
    );
    expect(result.outcome).toBe('fail');
    expect(result.failures.map(item => item.invariant)).toContain('not-blank');
  });

  it('fails closed on the observed DOM-alive but unpainted dark frame', () => {
    const result = evaluateDesktopCapture(
      observation({
        pixelStats: {
          width: 3016,
          height: 1936,
          entropy: 0.5338,
          meanLuma: 6.3439,
          maxChannelStdDev: 4.782,
        },
      })
    );

    expect(result.outcome).toBe('fail');
    expect(result.failures.map(item => item.invariant)).toContain('not-blank');
  });

  it('rejects a product surface retained in the bounded auth-handoff window', () => {
    const result = evaluateDesktopCapture(
      observation({
        stateId: 'desktop.shell.window',
        windowBounds: { width: 820, height: 520, x: 346, y: 231 },
      })
    );

    expect(result.outcome).toBe('fail');
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invariant: 'primary-window-role',
          evidence: expect.stringContaining('820×520'),
        }),
      ])
    );
  });

  it('fails when ordinary Ovie is isolated from the app shell', () => {
    const result = evaluateDesktopCapture(
      observation({
        stateId: 'desktop.ovie.in-shell',
        elements: observation().elements.filter(
          element => !['Chat', 'Ops', 'People'].includes(element.label ?? '')
        ),
      })
    );

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invariant: 'app-shell-present' }),
      ])
    );
  });

  it('requires fullscreen to hide sidebar chrome and expose a named exit', () => {
    const result = evaluateDesktopCapture(
      observation({
        stateId: 'desktop.ovie.fullscreen',
      })
    );

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invariant: 'app-chrome-hidden' }),
        expect.objectContaining({
          invariant: 'available-destination',
          evidence: expect.stringContaining('Exit fullscreen'),
        }),
      ])
    );
  });

  it('classifies missing visual instrumentation as blocked, not a product pass', () => {
    const result = evaluateDesktopCapture(
      observation({ screenshotFrameValid: false, pixelStats: null })
    );
    expect(result.outcome).toBe('blocked');
    expect(result.instrumentationBlockers).toHaveLength(1);
  });

  it('ignores unrelated native menu labels when evaluating product copy', () => {
    const result = evaluateDesktopCapture(
      observation({
        elements: [
          ...observation().elements,
          {
            role: 'AXMenuItem',
            label: '1% means not figured out',
            in_web_content: false,
          },
        ],
      })
    );
    expect(result.outcome).toBe('pass');
  });
});
