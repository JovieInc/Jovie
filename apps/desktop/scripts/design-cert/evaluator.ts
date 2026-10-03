import type { DesktopDesignInvariant } from './manifest';

export interface DesktopAxElement {
  readonly role: string;
  readonly label?: string;
  readonly value?: string;
  readonly enabled?: boolean;
  readonly in_web_content?: boolean;
}

export interface DesktopPixelStats {
  readonly width: number;
  readonly height: number;
  readonly entropy: number;
  readonly meanLuma: number;
  readonly maxChannelStdDev: number;
}

export interface DesktopWindowBounds {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

export interface DesktopCaptureObservation {
  readonly stateId: string;
  readonly processAlive: boolean;
  readonly windowFound: boolean;
  readonly windowOnScreen: boolean;
  readonly windowBounds: DesktopWindowBounds | null;
  readonly screenshotFrameValid: boolean;
  readonly pixelStats: DesktopPixelStats | null;
  readonly elements: readonly DesktopAxElement[];
}

export interface DesktopDesignFailure {
  readonly invariant: DesktopDesignInvariant;
  readonly screenState: string;
  readonly evidence: string;
  readonly owner: string;
  readonly nextProof: string;
}

export interface DesktopDesignEvaluation {
  readonly outcome: 'pass' | 'fail' | 'blocked';
  readonly failures: readonly DesktopDesignFailure[];
  readonly instrumentationBlockers: readonly string[];
  readonly observedLabels: readonly string[];
}

const OVIE_OWNER = 'Ovie HUD owner — apps/web/lib/hud and OvieMacHud';
const DESKTOP_OWNER = 'Desktop shell owner — apps/desktop';
const MIN_PRIMARY_WINDOW_WIDTH = 1200;
const MIN_PRIMARY_WINDOW_HEIGHT = 700;

function normalizedLabelSequence(
  elements: readonly DesktopAxElement[]
): readonly string[] {
  const allowedNativeLabels = new Set([
    'Back to Jovie',
    'Ovie',
    'Reload',
    'Force Reload',
  ]);
  return elements.flatMap(element => {
    if (
      !element.in_web_content &&
      !allowedNativeLabels.has(element.label ?? '')
    ) {
      return [];
    }
    return [element.label, element.value]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(value => value.trim());
  });
}

function normalizedLabels(
  elements: readonly DesktopAxElement[]
): readonly string[] {
  return [...new Set(normalizedLabelSequence(elements))];
}

function isBlank(stats: DesktopPixelStats): boolean {
  const nearSolid = stats.entropy < 0.12 && stats.maxChannelStdDev < 4;
  const emptyExtreme =
    (stats.meanLuma < 3 || stats.meanLuma > 252) && stats.maxChannelStdDev < 6;
  // A compositor-stalled Electron window can retain the native frame and a
  // live DOM while the content area is effectively black. The captured failure
  // measured entropy 0.5338, luma 6.3439, and channel stddev 4.782; healthy
  // Ovie frames measured entropy >3 and channel stddev >20.
  const unpaintedDarkFrame =
    stats.entropy < 0.75 &&
    stats.meanLuma < 10 &&
    stats.maxChannelStdDev < 8;
  return nearSolid || emptyExtreme || unpaintedDarkFrame;
}

function failure(
  invariant: DesktopDesignInvariant,
  screenState: string,
  evidence: string,
  owner: string,
  nextProof: string
): DesktopDesignFailure {
  return { invariant, screenState, evidence, owner, nextProof };
}

export function evaluateDesktopCapture(
  observation: DesktopCaptureObservation
): DesktopDesignEvaluation {
  const instrumentationBlockers: string[] = [];
  const failures: DesktopDesignFailure[] = [];
  const labelSequence = normalizedLabelSequence(observation.elements);
  const labels = normalizedLabels(observation.elements);
  const labelSet = new Set(labels);

  if (!observation.screenshotFrameValid || !observation.pixelStats) {
    instrumentationBlockers.push(
      'Screenshot frame or pixel statistics were unavailable; visual claims are blocked.'
    );
  }

  if (!observation.processAlive || !observation.windowFound) {
    failures.push(
      failure(
        'shell-active',
        observation.stateId,
        'The exact app process or main window was not alive.',
        DESKTOP_OWNER,
        'Rerun on the exact local bundle and retain its PID/window receipt.'
      )
    );
  } else if (!observation.windowOnScreen) {
    failures.push(
      failure(
        'shell-active',
        observation.stateId,
        'The main window was not on the active desktop Space.',
        DESKTOP_OWNER,
        'Show the same window without replacing its process, then recapture.'
      )
    );
  }

  if (observation.pixelStats && isBlank(observation.pixelStats)) {
    failures.push(
      failure(
        'not-blank',
        observation.stateId,
        `The screenshot was near-solid (entropy ${observation.pixelStats.entropy.toFixed(3)}, max channel deviation ${observation.pixelStats.maxChannelStdDev.toFixed(2)}).`,
        DESKTOP_OWNER,
        'Recover the renderer in the same window and prove a nonblank capture.'
      )
    );
  }

  const expectsPrimaryWindow =
    observation.stateId === 'desktop.shell.window' ||
    observation.stateId.startsWith('desktop.ovie.');
  if (expectsPrimaryWindow && observation.windowBounds) {
    const { width, height } = observation.windowBounds;
    if (
      width < MIN_PRIMARY_WINDOW_WIDTH ||
      height < MIN_PRIMARY_WINDOW_HEIGHT
    ) {
      failures.push(
        failure(
          'primary-window-role',
          observation.stateId,
          `The product surface was retained in a bounded ${width}×${height} window instead of the primary dogfood window.`,
          DESKTOP_OWNER,
          'Promote the route into the primary BrowserWindow, maximize it, and recapture the same PID with no small product window.'
        )
      );
    }
  }

  if (observation.stateId.startsWith('desktop.ovie.')) {
    const required = [
      'Ovie',
      'Default Alive',
      'Week-over-week Growth',
      'Shipping Throughput',
    ];
    const missing = required.filter(label => !labelSet.has(label));
    if (missing.length > 0) {
      failures.push(
        failure(
          'expected-surface-visible',
          observation.stateId,
          `Ovie was missing: ${missing.join(', ')}.`,
          OVIE_OWNER,
          'Recapture the exact local Ovie route with all three registered metric cards visible.'
        )
      );
    }

    if (!labelSet.has('Back to Jovie')) {
      failures.push(
        failure(
          'available-destination',
          observation.stateId,
          'No named Back to Jovie action was reachable in the renderer or native menu.',
          OVIE_OWNER,
          'Expose Back to Jovie and prove it keeps the same PID/window alive.'
        )
      );
    }

    const operatorChromeLabels = ['Chat', 'Ops', 'People'];
    const visibleOperatorChrome = operatorChromeLabels.filter(label =>
      labelSet.has(label)
    );
    const isFullscreenState = observation.stateId === 'desktop.ovie.fullscreen';

    if (isFullscreenState) {
      if (visibleOperatorChrome.length > 0) {
        failures.push(
          failure(
            'app-chrome-hidden',
            observation.stateId,
            `Fullscreen retained app chrome: ${visibleOperatorChrome.join(', ')}.`,
            OVIE_OWNER,
            'Hide the shared shell chrome only while fs=1 is active, then recapture.'
          )
        );
      }
      if (!labelSet.has('Exit fullscreen')) {
        failures.push(
          failure(
            'available-destination',
            observation.stateId,
            'Fullscreen exposed no named Exit fullscreen action.',
            OVIE_OWNER,
            'Expose Exit fullscreen and prove it returns in the same PID/window.'
          )
        );
      }
    } else if (visibleOperatorChrome.length < 2) {
      failures.push(
        failure(
          'app-shell-present',
          observation.stateId,
          'Ovie rendered without the normal operator sidebar/navigation.',
          OVIE_OWNER,
          'Render Ovie under /app/ov/ops and recapture with the shared sidebar visible.'
        )
      );
    }
  }

  if (observation.stateId === 'desktop.ovie.metrics-unavailable') {
    const unavailable = labels.some(label =>
      /unavailable|unknown/i.test(label)
    );
    const activeUsersIndex = labelSequence.indexOf('Active Users');
    const activeUsersValue = labelSequence[activeUsersIndex + 1];
    const falseZero = activeUsersIndex >= 0 && activeUsersValue === '0';
    const falseVerdict = labelSet.has('1% means not figured out');
    const recoveryNamed = labels.some(label =>
      /refresh|retry|reload/i.test(label)
    );

    if (!unavailable || falseZero || falseVerdict || !recoveryNamed) {
      failures.push(
        failure(
          'truthful-state',
          observation.stateId,
          [
            !unavailable ? 'No unavailable status was visible.' : null,
            falseZero ? 'Unknown active users rendered as 0.' : null,
            falseVerdict ? 'Unknown growth rendered a YC verdict.' : null,
            !recoveryNamed
              ? 'No refresh, retry, or reload recovery was named.'
              : null,
          ]
            .filter((value): value is string => value !== null)
            .join(' '),
          OVIE_OWNER,
          'Render em dashes and specific recovery copy, then pass two exact local packaged captures.'
        )
      );
    }
  }

  return {
    outcome:
      instrumentationBlockers.length > 0
        ? 'blocked'
        : failures.length > 0
          ? 'fail'
          : 'pass',
    failures,
    instrumentationBlockers,
    observedLabels: labels,
  };
}
