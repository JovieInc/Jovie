import { describe, expect, it } from 'vitest';
import type { FactoryHealthSnapshot } from './factory-health';
import { renderTasteInboxHtml } from './render-dashboard';

const FACTORY_HEALTH_FIXTURE: FactoryHealthSnapshot = {
  computedAt: '2026-06-20T12:00:00.000Z',
  metrics: [
    {
      id: 'cycle-time',
      label: 'Cycle time',
      value: '—',
      subtitle: 'Set HUD_GITHUB_TOKEN or GITHUB_TOKEN',
      availability: 'not_configured',
      trend7d: [0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: 'autonomy-ratio',
      label: 'Autonomy ratio',
      value: '—',
      subtitle: 'Set HUD_GITHUB_TOKEN or GITHUB_TOKEN',
      availability: 'not_configured',
      trend7d: [0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: 'incident-mttr',
      label: 'Incident MTTR',
      value: '—',
      subtitle: 'Not instrumented — observability pipeline (#10936)',
      availability: 'not_instrumented',
      trend7d: [0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: 'code-shelf-life',
      label: 'Code shelf life',
      value: '—',
      subtitle: 'Not instrumented — git churn telemetry pending',
      availability: 'not_instrumented',
      trend7d: [0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: 'cost-per-pr',
      label: 'Cost / merged PR',
      value: '—',
      subtitle: 'Not instrumented — model + CI spend ledger pending',
      availability: 'not_instrumented',
      trend7d: [0, 0, 0, 0, 0, 0, 0],
    },
  ],
};

describe('renderTasteInboxHtml', () => {
  it('renders factory-health strip above inbox sections', () => {
    const html = renderTasteInboxHtml({
      fetchedAt: '2026-06-20T12:00:00.000Z',
      available: true,
      factoryHealth: FACTORY_HEALTH_FIXTURE,
      issues: [],
    });

    const stripIndex = html.indexOf('data-testid="factory-health-strip"');
    const tasteIndex = html.indexOf('Taste calls');
    expect(stripIndex).toBeGreaterThan(-1);
    expect(tasteIndex).toBeGreaterThan(stripIndex);
    expect(html).toContain('Factory health');
  });

  it('renders only labelled issues and includes taste screenshots', () => {
    const html = renderTasteInboxHtml({
      fetchedAt: '2026-06-20T12:00:00.000Z',
      available: true,
      factoryHealth: FACTORY_HEALTH_FIXTURE,
      issues: [
        {
          id: '1',
          identifier: 'JOV-10',
          title: 'Hero accent',
          url: 'https://linear.app/jovie/issue/JOV-10',
          label: 'needs:taste',
          priority: 2,
          priorityLabel: 'High',
          createdAt: '2026-06-10T12:00:00Z',
          description: 'Capture: web https://staging.jov.ie/',
          blockingReason: 'Capture: web https://staging.jov.ie/',
          screenshotPath: 'screenshots/JOV-10.png',
        },
        {
          id: '2',
          identifier: 'JOV-11',
          title: 'Rotate leaked key',
          url: 'https://linear.app/jovie/issue/JOV-11',
          label: 'needs:human',
          priority: 1,
          priorityLabel: 'Urgent',
          createdAt: '2026-06-11T09:00:00Z',
          description: 'Requires Tim to rotate the key in Doppler.',
          blockingReason: 'Requires Tim to rotate the key in Doppler.',
        },
      ],
    });

    expect(html).toContain('JOV-10');
    expect(html).toContain('JOV-11');
    expect(html).toContain('img src="screenshots/JOV-10.png"');
    expect(html).not.toContain('bug');
  });

  it('shows only human blocker copy for human-labelled issues', () => {
    const html = renderTasteInboxHtml({
      fetchedAt: '2026-06-20T12:00:00.000Z',
      available: true,
      factoryHealth: FACTORY_HEALTH_FIXTURE,
      issues: [
        {
          id: '2',
          identifier: 'JOV-11',
          title: 'Rotate leaked key',
          url: 'https://linear.app/jovie/issue/JOV-11',
          label: 'needs:human',
          priority: 1,
          priorityLabel: 'Urgent',
          createdAt: '2026-06-11T09:00:00Z',
          description: 'Requires Tim to rotate the key in Doppler.',
          blockingReason: 'Requires Tim to rotate the key in Doppler.',
        },
      ],
    });

    expect(html).toContain('Requires Tim to rotate the key in Doppler.');
    expect(html).not.toContain('screenshots/');
  });
});
