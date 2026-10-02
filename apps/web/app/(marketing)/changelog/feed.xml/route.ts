import { APP_NAME, BASE_URL } from '@/constants/app';
import { getChangelogSnapshot } from '@/lib/changelog-source';
import {
  type CustomerChangelogEntry,
  customerChangelogEntryPath,
  formatCustomerChangelogTertiary,
  projectCustomerChangelogArchive,
} from '@/lib/customer-changelog';

// Fully static
export const revalidate = false;

export function atomEntryId(
  entry: Pick<CustomerChangelogEntry, 'slug'>
): string {
  return `${BASE_URL}${customerChangelogEntryPath(entry)}`;
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function GET() {
  const snapshot = await getChangelogSnapshot();
  const entries = projectCustomerChangelogArchive(
    snapshot.sourceReleases
  ).entries.slice(0, 20);

  const atomEntries = entries
    .map(entry => {
      const updated = entry.date
        ? `${entry.date}T00:00:00Z`
        : new Date().toISOString();
      const tertiary = formatCustomerChangelogTertiary(
        entry.date,
        entry.technicalVersion
      );
      const contentHtml = `<p>${escapeXml(entry.summary)}</p>`;
      const url = atomEntryId(entry);

      return `
    <entry>
      <title>${escapeXml(entry.title)}</title>
      <id>${escapeXml(url)}</id>
      <link href="${escapeXml(url)}" rel="alternate"/>
      <updated>${updated}</updated>
      <summary>${escapeXml(tertiary)}</summary>
      <content type="html">${contentHtml}</content>
    </entry>`;
    })
    .join('\n');

  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(APP_NAME)} Changelog</title>
  <subtitle>Product updates and improvements</subtitle>
  <link href="${escapeXml(BASE_URL)}/changelog/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="${escapeXml(BASE_URL)}/changelog" rel="alternate"/>
  <id>${escapeXml(BASE_URL)}/changelog</id>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>${escapeXml(APP_NAME)}</name>
  </author>
${atomEntries}
</feed>`;

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
