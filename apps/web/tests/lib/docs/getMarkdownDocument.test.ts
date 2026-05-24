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

  it('removes dangerous HTML from markdown output', async () => {
    const md =
      '## Safe\n\n<script>alert("x")</script><a href="javascript:alert(1)" onclick="alert(2)">Bad link</a>';
    const doc = await createMarkdownDocument(md);

    expect(doc.html).toContain('Bad link');
    expect(doc.html).not.toContain('<script');
    expect(doc.html).not.toContain('javascript:');
    expect(doc.html).not.toContain('onclick');
  });

  it('renders GitHub-flavored tables and task lists', async () => {
    const md = [
      '| Cookie Name | Purpose |',
      '| --- | --- |',
      '| `jv_cc` | Stores consent preferences |',
      '',
      '- [x] Essential cookies',
      '- [ ] Marketing cookies',
    ].join('\n');
    const doc = await createMarkdownDocument(md);

    expect(doc.html).toContain('<table>');
    expect(doc.html).toContain('<th>Cookie Name</th>');
    expect(doc.html).toContain('<code>jv_cc</code>');
    expect(doc.html).toContain('class="contains-task-list"');
    expect(doc.html).toContain('class="task-list-item"');
    expect(doc.html).toContain('type="checkbox"');
  });

  it('sanitizes dangerous HTML inside GFM table and task list output', async () => {
    const md = [
      '| Name | Link |',
      '| --- | --- |',
      '| Bad | <a href="javascript:alert(1)" onclick="alert(2)">Unsafe</a> |',
      '',
      '- [x] <span onclick="alert(3)">Checked</span>',
      '- [ ] <script>alert("x")</script>Unchecked',
    ].join('\n');
    const doc = await createMarkdownDocument(md);

    expect(doc.html).toContain('<table>');
    expect(doc.html).toContain('Unsafe');
    expect(doc.html).toContain('Checked');
    expect(doc.html).toContain('Unchecked');
    expect(doc.html).not.toContain('<script');
    expect(doc.html).not.toContain('javascript:');
    expect(doc.html).not.toContain('onclick');
  });
});
