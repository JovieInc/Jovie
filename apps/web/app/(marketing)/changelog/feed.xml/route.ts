import fs from 'node:fs';
import path from 'node:path';
import { APP_NAME, APP_URL } from '@/constants/app';
import { parseChangelog } from '@/lib/changelog-parser';

// Fully static
export const revalidate = false;

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function GET() {
  const candidates = [
    path.join(process.cwd(), 'CHANGELOG.md'),
    path.join(process.cwd(), '..', '..', 'CHANGELOG.md'),
  ];

  let markdown = '';
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      markdown = fs.readFileSync(p, 'utf8');
      break;
    }
  }

  const releases = parseChangelog(markdown);

  const atomEntries = releases
    .slice(0, 20)
    .map(release => {
      const updated = release.date
        ? `${release.date}T00:00:00Z`
        : new Date().toISOString();
      const summaryHtml = release.summary
        ? `<p>${escapeXml(release.summary)}</p>`
        : '';
      const allEntries = [
        ...release.sections.added,
        ...release.sections.changed,
        ...release.sections.fixed,
        ...release.sections.removed,
      ];
      const listHtml = allEntries.map(c => `<li>${escapeXml(c)}</li>`).join('');
      const contentHtml = summaryHtml + `<ul>${listHtml}</ul>`;

      return `
    <entry>
      <title>${escapeXml(APP_NAME)} v${escapeXml(release.version)}</title>
      <id>${escapeXml(APP_URL)}/changelog#v${escapeXml(release.version)}</id>
      <link href="${escapeXml(APP_URL)}/changelog" rel="alternate"/>
      <updated>${updated}</updated>
      <content type="html">${escapeXml(contentHtml)}</content>
    </entry>`;
    })
    .join('\n');

  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(APP_NAME)} Changelog</title>
  <subtitle>Product updates and improvements</subtitle>
  <link href="${escapeXml(APP_URL)}/changelog/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="${escapeXml(APP_URL)}/changelog" rel="alternate"/>
  <id>${escapeXml(APP_URL)}/changelog</id>
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
