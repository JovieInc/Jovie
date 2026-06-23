import { describe, expect, it } from 'vitest';
import { renderTasteInboxHtml } from './render-dashboard';

describe('renderTasteInboxHtml', () => {
  it('renders only labelled issues and includes taste screenshots', () => {
    const html = renderTasteInboxHtml({
      fetchedAt: '2026-06-20T12:00:00.000Z',
      available: true,
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
