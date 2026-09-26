import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  type ChangelogRelease,
  changelogReleaseAnchor,
} from '@/lib/changelog-parser';
import { getChangelogSnapshot } from '@/lib/changelog-source';
import {
  formatCustomerChangelogTertiary,
  projectCustomerChangelog,
} from '@/lib/customer-changelog';

// Fully static
export const revalidate = false;

export function atomEntryId(
  version: string,
  kind: ChangelogRelease['kind'] = 'release'
): string {
  return `${BASE_URL}/changelog#${changelogReleaseAnchor({ version, kind })}`;
}

function versionPageUrl(version: string): string {
  return `${BASE_URL}/changelog/${encodeURIComponent(version)}`;
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
  const entries = projectCustomerChangelog(snapshot.releases).slice(0, 20);

  const atomEntries = entries
    .map(entry => {
      const updated = entry.date
        ? `${entry.date}T00:00:00Z`
        : new Date().toISOString();
      const tertiary = formatCustomerChangelogTertiary(
        entry.date,
        entry.technicalVersion,
        entry.technicalKind
      );
      const contentHtml = `<p>${escapeXml(entry.summary)}</p>`;

      return `
    <entry>
      <title>${escapeXml(entry.title)}</title>
      <id>${escapeXml(atomEntryId(entry.technicalVersion, entry.technicalKind))}#${escapeXml(entry.slug)}</id>
      <link href="${escapeXml(versionPageUrl(entry.technicalVersion))}" rel="alternate"/>
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
