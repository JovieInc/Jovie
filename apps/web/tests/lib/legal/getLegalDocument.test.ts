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
});
