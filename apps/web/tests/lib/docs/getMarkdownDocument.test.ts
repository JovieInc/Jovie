import { describe, expect, it } from 'vitest';
import { createMarkdownDocument } from '@/lib/docs/getMarkdownDocument';

describe('createMarkdownDocument', () => {
  // Regression: ISSUE-001 — in-page anchor links must match heading IDs
  // Found by /qa on 2026-04-06
  // Report: .gstack/qa-reports/qa-report-jov-ie-2026-04-06.md
  it('preserves heading IDs without user-content- prefix', async () => {
    const md = '## Privacy and Data\n\nSome content here.';
    const doc = await createMarkdownDocument(md);

    expect(doc.html).toContain('id="privacy-and-data"');
    expect(doc.html).not.toContain('user-content-');
    expect(doc.toc).toEqual([
      { id: 'privacy-and-data', title: 'Privacy and Data', level: 2 },
    ]);
  });

  it('generates matching IDs for TOC and heading elements', async () => {
    const md =
      '## First Section\n\nContent.\n\n### Sub Section\n\nMore content.';
    const doc = await createMarkdownDocument(md);

    for (const entry of doc.toc) {
      expect(doc.html).toContain(`id="${entry.id}"`);
    }
  });

  it('resolves in-page anchor links to correct heading IDs', async () => {
    const md =
      '## Target Heading\n\nContent.\n\nSee [the target](#target-heading) for details.';
    const doc = await createMarkdownDocument(md);

    expect(doc.html).toContain('id="target-heading"');
    expect(doc.html).toContain('href="#target-heading"');
  });
});
