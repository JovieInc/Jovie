import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertAliasPhaseTiming,
  createAliasPhaseProbeConfig,
  createAliasPhaseProbeScript,
} from './performance-budgets-guard';
import { getEndUserPerfRouteById } from './performance-route-manifest';

function markElementVisible(element: Element) {
  vi.spyOn(element, 'getClientRects').mockReturnValue([
    { height: 1, width: 1 },
  ] as unknown as DOMRectList);
}

describe('alias readiness accepts the canonical surface per viewport', () => {
  const listenRoute = getEndUserPerfRouteById('public-profile-listen');

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
    window.history.pushState({}, '', '/');
    delete (
      window as Window & {
        __perfAliasPhaseProbe?: unknown;
      }
    ).__perfAliasPhaseProbe;
  });

  function appendVisibleElement(
    testId: string,
    options: {
      readonly interactiveReady?: boolean;
      readonly visible?: boolean;
    } = {}
  ) {
    const element = document.createElement('div');
    element.setAttribute('data-testid', testId);
    if (options.interactiveReady) {
      element.setAttribute('data-interactive-ready', 'true');
    }
    if (options.visible !== false) {
      markElementVisible(element);
    }
    document.body.append(element);
    return element;
  }

  function readProbeState() {
    return (
      window as Window & {
        __perfAliasPhaseProbe?: {
          readonly destinationAffordanceMs?: number;
          readonly interactiveReadyMs?: number;
          readonly sampleKey?: string;
          readonly shellVisibleMs?: number;
        };
      }
    ).__perfAliasPhaseProbe;
  }

  it('is ready at desktop widths via the desktop surface when the compact shell is unmounted', () => {
    // 1280x720 (Playwright's default context) after #24709: the compact shell
    // is unmounted and the desktop surface owns the document.
    window.history.pushState({}, '', '/dualipa?mode=listen');
    appendVisibleElement('profile-desktop-top-chrome');
    appendVisibleElement('profile-desktop-surface', {
      interactiveReady: true,
    });
    appendVisibleElement('profile-primary-tab-listen');

    const config = createAliasPhaseProbeConfig(
      listenRoute!,
      '/dualipa/listen',
      'desktop-surface-sample'
    );
    expect(config).toBeDefined();

    new Function(createAliasPhaseProbeScript(config!))();

    const phases = assertAliasPhaseTiming(
      readProbeState(),
      'desktop-surface-sample',
      performance.now() + 1_000
    );

    expect(phases.shellVisibleMs).toBeGreaterThanOrEqual(
      phases.redirectCompleteMs
    );
    expect(phases.interactiveReadyMs).toBeGreaterThanOrEqual(
      phases.shellVisibleMs
    );
    expect(phases.destinationAffordanceMs).toBeGreaterThanOrEqual(
      phases.interactiveReadyMs
    );
  });

  it('stays ready at 390 widths when only the compact shell is mounted', () => {
    window.history.pushState({}, '', '/dualipa?mode=listen');
    appendVisibleElement('profile-header');
    appendVisibleElement('profile-compact-shell', { interactiveReady: true });
    appendVisibleElement('profile-primary-tab-listen');
    // The desktop surface is server-rendered into a zero-box hidden shell at
    // mobile widths — present in the DOM, never visible.
    appendVisibleElement('profile-desktop-surface', {
      interactiveReady: true,
      visible: false,
    });

    const config = createAliasPhaseProbeConfig(
      listenRoute!,
      '/dualipa/listen',
      'compact-shell-sample'
    );
    expect(config).toBeDefined();

    new Function(createAliasPhaseProbeScript(config!))();

    const phases = assertAliasPhaseTiming(
      readProbeState(),
      'compact-shell-sample',
      performance.now() + 1_000
    );

    expect(phases.shellVisibleMs).toBeGreaterThanOrEqual(
      phases.redirectCompleteMs
    );
    expect(phases.interactiveReadyMs).toBeGreaterThanOrEqual(
      phases.shellVisibleMs
    );
    expect(phases.destinationAffordanceMs).toBeGreaterThanOrEqual(
      phases.interactiveReadyMs
    );
  });

  it('does not false-ready on a zero-box desktop surface while the compact shell is still hydrating', async () => {
    window.history.pushState({}, '', '/dualipa?mode=listen');
    appendVisibleElement('profile-desktop-top-chrome');
    appendVisibleElement('profile-header');
    // Compact shell mounted but hydration has not stamped the ready marker;
    // desktop surface carries the marker but keeps a zero client-rect box.
    appendVisibleElement('profile-compact-shell');
    appendVisibleElement('profile-desktop-surface', {
      interactiveReady: true,
      visible: false,
    });
    appendVisibleElement('profile-primary-tab-listen');

    const config = createAliasPhaseProbeConfig(
      listenRoute!,
      '/dualipa/listen',
      'hydrating-sample'
    );
    expect(config).toBeDefined();

    new Function(createAliasPhaseProbeScript(config!))();

    await new Promise(resolve => setTimeout(resolve, 60));

    const state = readProbeState();
    expect(state?.interactiveReadyMs).toBeUndefined();
  });
});
