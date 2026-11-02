import {
  type CustomerChangelogEntry,
  compareCustomerChangelogNewestFirst,
  customerChangelogEntryPath,
  formatCustomerChangelogTertiary,
} from '@/lib/customer-changelog';

/** Entries per feed document; readers poll, so the newest window is enough. */
export const CHANGELOG_FEED_ENTRY_LIMIT = 20;

export interface ChangelogFeedSite {
  readonly appName: string;
  readonly baseUrl: string;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function changelogEntryUrl(
  baseUrl: string,
  entry: Pick<CustomerChangelogEntry, 'slug'>
): string {
  return `${baseUrl}${customerChangelogEntryPath(entry)}`;
}

/** Newest first, capped, so every feed format shares one ordering. */
export function selectFeedEntries(
  entries: readonly CustomerChangelogEntry[],
  limit: number = CHANGELOG_FEED_ENTRY_LIMIT
): CustomerChangelogEntry[] {
  return [...entries].sort(compareCustomerChangelogNewestFirst).slice(0, limit);
}

function entryInstant(
  entry: Pick<CustomerChangelogEntry, 'date'>
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return null;
  const parsed = new Date(`${entry.date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Feed-level timestamp: the newest entry date, so the document is stable
 * between publications (readers dedupe on it). Falls back to `fallback` only
 * when no entry is dated.
 */
export function feedUpdatedAt(
  entries: readonly CustomerChangelogEntry[],
  fallback: Date
): Date {
  for (const entry of entries) {
    const instant = entryInstant(entry);
    if (instant) return instant;
  }
  return fallback;
}

function entryHtml(entry: CustomerChangelogEntry): string {
  const paragraphs = [entry.summary, ...entry.supporting]
    .filter(text => text.trim().length > 0)
    .map(text => `<p>${escapeXml(text)}</p>`);
  return paragraphs.join('');
}

export function renderChangelogAtom(
  site: ChangelogFeedSite,
  allEntries: readonly CustomerChangelogEntry[],
  now: Date
): string {
  const entries = selectFeedEntries(allEntries);
  const updated = feedUpdatedAt(entries, now).toISOString();
  const atomEntries = entries
    .map(entry => {
      const url = changelogEntryUrl(site.baseUrl, entry);
      const instant = entryInstant(entry)?.toISOString() ?? updated;
      const tertiary = formatCustomerChangelogTertiary(
        entry.date,
        entry.technicalVersion
      );
      return `
  <entry>
    <title>${escapeXml(entry.title)}</title>
    <id>${escapeXml(url)}</id>
    <link href="${escapeXml(url)}" rel="alternate" type="text/html"/>
    <published>${instant}</published>
    <updated>${instant}</updated>
    <summary>${escapeXml(tertiary)}</summary>
    <content type="html">${escapeXml(entryHtml(entry))}</content>
  </entry>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(site.appName)} Changelog</title>
  <subtitle>Product updates and improvements</subtitle>
  <link href="${escapeXml(site.baseUrl)}/changelog/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="${escapeXml(site.baseUrl)}/changelog" rel="alternate" type="text/html"/>
  <id>${escapeXml(site.baseUrl)}/changelog</id>
  <updated>${updated}</updated>
  <author>
    <name>${escapeXml(site.appName)}</name>
  </author>${atomEntries}
</feed>
`;
}

export function renderChangelogRss(
  site: ChangelogFeedSite,
  allEntries: readonly CustomerChangelogEntry[],
  now: Date
): string {
  const entries = selectFeedEntries(allEntries);
  const lastBuild = feedUpdatedAt(entries, now).toUTCString();
  const items = entries
    .map(entry => {
      const url = changelogEntryUrl(site.baseUrl, entry);
      const instant = entryInstant(entry);
      return `
    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>${
        instant ? `\n      <pubDate>${instant.toUTCString()}</pubDate>` : ''
      }
      <description>${escapeXml(entryHtml(entry))}</description>
    </item>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.appName)} Changelog</title>
    <link>${escapeXml(site.baseUrl)}/changelog</link>
    <description>Product updates and improvements to ${escapeXml(site.appName)}.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${escapeXml(site.baseUrl)}/changelog/rss.xml" rel="self" type="application/rss+xml"/>${items}
  </channel>
</rss>
`;
}
