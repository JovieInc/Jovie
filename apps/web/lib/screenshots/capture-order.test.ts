import { describe, expect, it } from 'vitest';
import { orderScreenshotScenariosForCapture } from './capture-order';
import { SCREENSHOT_SCENARIOS } from './registry';
import type { ScreenshotScenario } from './types';

function scenario(
  id: string,
  captureAfter?: readonly string[]
): ScreenshotScenario {
  return {
    id,
    title: id,
    group: 'marketing',
    groupLabel: 'Marketing',
    route: '/',
    waitFor: 'main',
    viewport: 'desktop',
    theme: 'dark',
    consumers: ['admin'],
    fullPage: false,
    ...(captureAfter ? { captureAfter } : {}),
  };
}

describe('screenshot capture order', () => {
  it('refreshes a producer before the marketing surface that embeds it', () => {
    const ordered = orderScreenshotScenariosForCapture([
      scenario('homepage', ['dashboard-export']),
      scenario('release-landing'),
      scenario('dashboard-export'),
    ]);

    expect(ordered.map(item => item.id)).toEqual([
      'dashboard-export',
      'homepage',
      'release-landing',
    ]);
  });

  it('fails closed for a cyclic screenshot dependency', () => {
    expect(() =>
      orderScreenshotScenariosForCapture([
        scenario('homepage', ['dashboard']),
        scenario('dashboard', ['homepage']),
      ])
    ).toThrow('Screenshot capture dependency cycle');
  });

  it('keeps the real dashboard export ahead of its homepage consumer', () => {
    const orderedIds = orderScreenshotScenariosForCapture(
      SCREENSHOT_SCENARIOS
    ).map(item => item.id);

    expect(
      orderedIds.indexOf('dashboard-releases-sidebar-desktop')
    ).toBeLessThan(orderedIds.indexOf('marketing-home-desktop'));
  });

  it('fails closed for an unknown screenshot dependency', () => {
    expect(() =>
      orderScreenshotScenariosForCapture([
        scenario('homepage', ['missing-dashboard-export']),
      ])
    ).toThrow(
      'Unknown screenshot capture dependency missing-dashboard-export for homepage'
    );
  });
});
