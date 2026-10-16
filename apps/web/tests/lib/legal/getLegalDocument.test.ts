import { describe, expect, it } from 'vitest';
import { getLegalDocument } from '@/lib/legal/getLegalDocument';

describe('getLegalDocument', () => {
  it('uses legal markdown title and date as document metadata', async () => {
    const doc = await getLegalDocument('privacy');

    expect(doc.title).toBe('Privacy Policy');
    expect(doc.lastUpdated).toBe('February 2026');
    expect(doc.practicalSummary).toContain('collect only what is essential');
    expect(doc.html).not.toContain('<h2 id="privacy-policy"');
    expect(doc.html).not.toContain('Last updated: February 2026');
  });

  it('renders cookie policy GFM tables in the legal body', async () => {
    const doc = await getLegalDocument('cookies');

    expect(doc.title).toBe('Cookie Policy');
    expect(doc.lastUpdated).toBe('May 2026');
    expect(doc.html).toContain('<table>');
    expect(doc.html).toContain('<th>Cookie Name</th>');
    expect(doc.html).toContain('<code>jv_cc</code>');
  });

  it('renders every cookie policy table inside a focusable scroll region', async () => {
    // Regression: axe scrollable-region-focusable flagged the /legal/cookies
    // cookie tables as scrollable but not keyboard-focusable (JOV-8068).
    const doc = await getLegalDocument('cookies');

    const regionOpen =
      '<div tabindex="0" role="region" aria-label="Scrollable table">';
    const regionCount = doc.html.split(regionOpen).length - 1;
    const tableCount = doc.html.split('<table>').length - 1;

    expect(tableCount).toBeGreaterThan(0);
    expect(regionCount).toBe(tableCount);
    expect(doc.html).toContain('<code>jovie_lead_attribution</code>');
  });

  it('keeps legal routes fully static', async () => {
    const layout = await import('@/app/(dynamic)/legal/layout');
    const routeModules = await Promise.all([
      import('@/app/(dynamic)/legal/privacy/page'),
      import('@/app/(dynamic)/legal/terms/page'),
      import('@/app/(dynamic)/legal/cookies/page'),
      import('@/app/(dynamic)/legal/dmca/page'),
    ]);

    expect(layout.revalidate).toBe(false);

    for (const routeModule of routeModules) {
      expect(routeModule.dynamic).toBe('force-static');
      expect(routeModule.revalidate).toBe(false);
    }
  }, 15_000);
});
