// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  renderChangelogAtom,
  renderChangelogRss,
} from '@/lib/changelog-feed-xml';
import { parseChangelogDocument } from '@/lib/changelog-parser';
import {
  type CustomerChangelogEntry,
  projectCustomerChangelogArchive,
} from '@/lib/customer-changelog';

const SITE = { appName: 'Jovie', baseUrl: 'https://jov.ie' };
const NOW = new Date('2026-10-31T12:00:00Z');
const RFC822 =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

function entry(
  date: string,
  slug: string,
  title = `Title ${slug}`
): CustomerChangelogEntry {
  return {
    id: `customer-update:${slug}`,
    slug,
    aliases: [],
    date,
    title,
    summary: `Summary for ${slug} & <friends>`,
    supporting: [],
    technicalVersion: date,
  } as unknown as CustomerChangelogEntry;
}

// Out of order on purpose, as CHANGELOG.md sections are.
const ENTRIES = [
  entry('2026-10-02', 'oct-2'),
  entry('2026-10-25', 'oct-25'),
  entry('2026-10-13', 'oct-13'),
];

/** Parses with the platform XML parser; a malformed document fails the test. */
function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new Error(`malformed feed: ${error.textContent}`);
  return doc;
}

function text(node: ParentNode, selector: string): string {
  return node.querySelector(selector)?.textContent ?? '';
}

describe('changelog feeds', () => {
  it('RSS 2.0 is well formed, newest first, absolute, RFC-822 dated', () => {
    const doc = parseXml(renderChangelogRss(SITE, ENTRIES, NOW));
    expect(doc.documentElement.tagName).toBe('rss');
    expect(doc.documentElement.getAttribute('version')).toBe('2.0');
    const channel = doc.querySelector('channel');
    if (!channel) throw new Error('no channel');
    expect(text(channel, ':scope > title')).toBe('Jovie Changelog');
    expect(text(channel, ':scope > link')).toBe('https://jov.ie/changelog');
    expect(text(channel, ':scope > description')).not.toBe('');
    const lastBuild = text(channel, ':scope > lastBuildDate');
    expect(lastBuild).toMatch(RFC822);
    expect(lastBuild).toBe(new Date('2026-10-25T00:00:00Z').toUTCString());
    const items = [...channel.querySelectorAll('item')];
    expect(items.map(item => text(item, 'link'))).toEqual([
      'https://jov.ie/changelog#oct-25',
      'https://jov.ie/changelog#oct-13',
      'https://jov.ie/changelog#oct-2',
    ]);
    for (const item of items) {
      expect(text(item, 'title')).not.toBe('');
      expect(text(item, 'guid')).toMatch(/^https:\/\//);
      expect(text(item, 'pubDate')).toMatch(RFC822);
      // Escaped HTML round-trips to markup, never raw `<` in the XML.
      expect(text(item, 'description')).toContain('&amp; &lt;friends&gt;');
    }
  });

  it('Atom is well formed, newest first, and stable between publications', () => {
    const xml = renderChangelogAtom(SITE, ENTRIES, NOW);
    const doc = parseXml(xml);
    const feed = doc.documentElement;
    expect(feed.tagName).toBe('feed');
    expect(feed.namespaceURI).toBe('http://www.w3.org/2005/Atom');
    expect(text(feed, ':scope > updated')).toBe('2026-10-25T00:00:00.000Z');
    expect(
      [...feed.querySelectorAll('entry > id')].map(n => n.textContent)
    ).toEqual([
      'https://jov.ie/changelog#oct-25',
      'https://jov.ie/changelog#oct-13',
      'https://jov.ie/changelog#oct-2',
    ]);
    expect(renderChangelogAtom(SITE, ENTRIES, new Date())).toBe(xml);
  });

  it('caps each feed at the newest 20 entries', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      entry(`2026-09-${String(index + 1).padStart(2, '0')}`, `d-${index + 1}`)
    );
    const items = parseXml(
      renderChangelogRss(SITE, many, NOW)
    ).querySelectorAll('item');
    expect(items).toHaveLength(20);
    expect(text(items[0], 'link')).toBe('https://jov.ie/changelog#d-30');
  });
});

describe('real CHANGELOG.md', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../../../CHANGELOG.md'),
    'utf8'
  );
  const { entries } = projectCustomerChangelogArchive(
    parseChangelogDocument(source).sourceReleases
  );

  it('projects every receipted customer day (failed checks do not drop a post)', () => {
    const days = new Set(entries.map(e => e.date));
    for (const day of [
      '2026-10-25',
      '2026-10-24',
      '2026-10-13',
      '2026-10-08',
    ]) {
      expect(days).toContain(day);
    }
  });

  it('orders the archive newest first', () => {
    const dates = entries.map(e => e.date);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });
});
