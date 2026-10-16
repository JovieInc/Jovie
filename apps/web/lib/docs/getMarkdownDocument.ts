import { promises as fs } from 'node:fs';
import { toString } from 'mdast-util-to-string';
import { cache } from 'react';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import { visit } from 'unist-util-visit';
import { LEGAL_ENTITY_NAME } from '@/constants/app';
import { resolveAppContentPath } from '@/lib/filesystem-paths';
import { sanitizeServerHtml } from '@/lib/html/sanitize';
import type { MarkdownDocument, TocEntry } from '@/types/docs';

const slugifyHeading = (value: string): string => {
  const safeValue = value.slice(0, 200);
  return safeValue
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

type HeadingNode = {
  depth?: number;
  data?: {
    hProperties?: {
      id?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
};

export const applyMarkdownTemplate = (raw: string): string => {
  return raw.replaceAll(/\{\{\s*LEGAL_ENTITY_NAME\s*\}\}/g, LEGAL_ENTITY_NAME);
};

const SCROLLABLE_TABLE_REGION_LABEL = 'Scrollable table';

/**
 * Wrap each rendered markdown table in a keyboard-focusable scroll region.
 *
 * Legal/document tables are styled `display: block; overflow-x: auto`, so on
 * narrow viewports they become horizontally scrollable containers. axe rule
 * `scrollable-region-focusable` requires such regions to be reachable and
 * scrollable by keyboard; a `tabindex="0"` wrapper with a label is the
 * minimal accessible contract (the sanitizer keeps both attributes).
 */
export const wrapMarkdownTablesInFocusableRegions = (html: string): string => {
  let result = '';
  let index = 0;

  while (index < html.length) {
    const tableStart = html.indexOf('<table>', index);
    if (tableStart === -1) {
      result += html.slice(index);
      break;
    }

    const tableEnd = html.indexOf('</table>', tableStart);
    if (tableEnd === -1) {
      // Malformed input without a closing tag: leave the remainder untouched.
      result += html.slice(index);
      break;
    }

    result += html.slice(index, tableStart);
    result += `<div tabindex="0" role="region" aria-label="${SCROLLABLE_TABLE_REGION_LABEL}">`;
    result += html.slice(tableStart, tableEnd + '</table>'.length);
    result += '</div>';
    index = tableEnd + '</table>'.length;
  }

  return result;
};

export async function getMarkdownDocument(
  relativePath: string
): Promise<MarkdownDocument> {
  if (process.env.NODE_ENV === 'development') {
    return getMarkdownDocumentUncached(relativePath);
  }
  return getMarkdownDocumentCached(relativePath);
}

export async function createMarkdownDocument(
  raw: string
): Promise<MarkdownDocument> {
  const processor = remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false });
  const ast = processor.parse(raw);

  const toc: TocEntry[] = [];
  visit(ast, 'heading', node => {
    const heading = node as HeadingNode;
    if (!heading.depth) return;

    const title = toString(node as Parameters<typeof toString>[0]).trim();
    if (!title) return;
    if (heading.depth > 3) return;

    const headingId = slugifyHeading(title);
    if (!headingId) return;

    const data = heading.data ?? {};
    const hProperties = data.hProperties ?? {};
    hProperties.id = headingId;
    data.hProperties = hProperties;
    heading.data = data;

    toc.push({ id: headingId, title, level: heading.depth });
  });

  const transformed = await processor.run(ast);
  const htmlResult = processor.stringify(transformed as never);

  // Wrap tables in focusable scroll regions before sanitizing; the sanitizer
  // keeps tabindex/role/aria-label, so the wrapped regions survive intact.
  const withFocusableTables = wrapMarkdownTablesInFocusableRegions(
    htmlResult.toString()
  );

  // Sanitize HTML server-side so downstream readers can remain server components.
  const sanitizedHtml = sanitizeServerHtml(withFocusableTables);

  return {
    html: sanitizedHtml,
    toc,
  };
}

async function getMarkdownDocumentUncached(
  relativePath: string
): Promise<MarkdownDocument> {
  const absolutePath = resolveAppContentPath(relativePath);
  const raw = applyMarkdownTemplate(await fs.readFile(absolutePath, 'utf-8'));

  return createMarkdownDocument(raw);
}

const getMarkdownDocumentCached = cache(
  async (relativePath: string): Promise<MarkdownDocument> => {
    const absolutePath = resolveAppContentPath(relativePath);
    const raw = applyMarkdownTemplate(await fs.readFile(absolutePath, 'utf-8'));

    return createMarkdownDocument(raw);
  }
);
