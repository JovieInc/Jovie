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

type TableNode = {
  children?: unknown[];
  data?: {
    hProperties?: {
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
};

// Readers render GitHub-flavored markdown tables as block-level scrollable
// regions (overflow-x-auto at narrow viewports). A scrollable region that is
// not keyboard-focusable fails axe's scrollable-region-focusable rule, so
// give every table a sequential focus stop and an accessible name. The name
// comes from the table's own header row so screen readers announce what the
// table holds.
function describeTableForAccessibility(node: TableNode): string {
  const headerRow = Array.isArray(node.children)
    ? (node.children[0] as TableNode | undefined)
    : undefined;
  const headerCells = Array.isArray(headerRow?.children)
    ? (headerRow.children as TableNode[])
    : [];
  const headerText = headerCells
    .map(cell => toString(cell as Parameters<typeof toString>[0]).trim())
    .filter(Boolean)
    .join(', ');
  return headerText ? `Table: ${headerText}` : 'Data table';
}

function enrichTableForAccessibility(node: TableNode): void {
  const data = node.data ?? {};
  const hProperties = data.hProperties ?? {};
  hProperties.tabIndex = 0;
  hProperties.ariaLabel = describeTableForAccessibility(node);
  data.hProperties = hProperties;
  node.data = data;
}

export const applyMarkdownTemplate = (raw: string): string => {
  return raw.replaceAll(/\{\{\s*LEGAL_ENTITY_NAME\s*\}\}/g, LEGAL_ENTITY_NAME);
};

export async function getMarkdownDocument(
  relativePath: string
): Promise<MarkdownDocument> {
  if (process.env.NODE_ENV === 'development') {
    return getMarkdownDocumentUncached(relativePath);
  }
  return getMarkdownDocumentCached(relativePath);
}

export interface CreateMarkdownDocumentOptions {
  /**
   * Make GFM tables sequential focus stops with accessible names. Set it for
   * readers that render tables as block-level scrollable regions
   * (overflow-x-auto at narrow viewports): an unfocusable scrollable region
   * fails axe's scrollable-region-focusable rule. Readers whose tables never
   * scroll keep the default so no pointless tab stops appear.
   */
  readonly focusableTables?: boolean;
}

export async function createMarkdownDocument(
  raw: string,
  options: CreateMarkdownDocumentOptions = {}
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

  if (options.focusableTables) {
    visit(ast, 'table', node => {
      enrichTableForAccessibility(node as unknown as TableNode);
    });
  }

  const transformed = await processor.run(ast);
  const htmlResult = processor.stringify(transformed as never);

  // Sanitize HTML server-side so downstream readers can remain server components.
  const sanitizedHtml = sanitizeServerHtml(htmlResult.toString());

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
