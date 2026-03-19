import fs from 'node:fs';
import path from 'node:path';
import { APP_NAME, APP_URL } from '@/constants/app';

// Fully static
export const revalidate = false;

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?$/;
const SECTION_HEADING_RE = /^### (Added|Changed|Fixed|Removed)$/;

interface FeedEntry {
  version: string;
  date: string;
  content: string[];
}

function parseForFeed(markdown: string): FeedEntry[] {
  const lines = markdown.split('\n');
  const entries: FeedEntry[] = [];
  let current: FeedEntry | null = null;

  for (const line of lines) {
    const vMatch = line.match(VERSION_HEADING_RE);
    if (vMatch) {
      const [, version, date] = vMatch;
      if (version.toLowerCase() === 'unreleased') {
        current = null;
        continue;
      }
      current = { version, date: date || '', content: [] };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    if (SECTION_HEADING_RE.test(line)) continue;

    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      current.content.push(trimmed.slice(2));
    }
  }
  return entries;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

  const entries = parseForFeed(markdown);

  const atomEntries = entries
    .slice(0, 20)
    .map(entry => {
      const updated = entry.date
        ? `${entry.date}T00:00:00Z`
        : new Date().toISOString();
      const contentHtml = entry.content
        .map(c => `<li>${escapeXml(c)}</li>`)
        .join('');

      return `
    <entry>
      <title>${escapeXml(APP_NAME)} v${escapeXml(entry.version)}</title>
      <id>${escapeXml(APP_URL)}/changelog#v${escapeXml(entry.version)}</id>
      <link href="${escapeXml(APP_URL)}/changelog" rel="alternate"/>
      <updated>${updated}</updated>
      <content type="html">&lt;ul&gt;${escapeXml(contentHtml)}&lt;/ul&gt;</content>
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
