import { describe, expect, it, vi } from 'vitest';
import { getLegalDocument } from '@/lib/legal/getLegalDocument';

vi.mock('@/components/marketing', () => ({
  MarketingContainer: () => null,
}));
vi.mock('@/components/site/PublicPageShell', () => ({
  PublicPageShell: () => null,
}));
vi.mock('@/components/organisms/LegalPage', () => ({
  LegalPage: () => null,
}));

import * as cookiesRoute from '@/app/(dynamic)/legal/cookies/page';
import * as dmcaRoute from '@/app/(dynamic)/legal/dmca/page';
import { revalidate as layoutRevalidate } from '@/app/(dynamic)/legal/layout';
import * as privacyRoute from '@/app/(dynamic)/legal/privacy/page';
import * as termsRoute from '@/app/(dynamic)/legal/terms/page';

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

  it('keeps legal routes fully static', () => {
    expect(layoutRevalidate).toBe(false);

    for (const routeModule of [
      privacyRoute,
      termsRoute,
      cookiesRoute,
      dmcaRoute,
    ]) {
      expect(routeModule.dynamic).toBe('force-static');
      expect(routeModule.revalidate).toBe(false);
    }
  });
});
