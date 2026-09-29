/**
 * Storybook mock for '@/lib/docs/getMarkdownDocument'.
 *
 * The real module imports `node:fs` at module scope for the file-based
 * getMarkdownDocument path, which crashes Storybook's browser Vite build.
 * createMarkdownDocument itself is isomorphic, so this mock re-implements it
 * with the same remark pipeline minus the filesystem reads and heading-id
 * mutation (story previews do not need anchor links).
 */
import { toString } from 'mdast-util-to-string';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import { visit } from 'unist-util-visit';
import type { MarkdownDocument, TocEntry } from '@/types/docs';

const slugifyHeading = (value: string): string =>
  value
    .slice(0, 200)
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

export const applyMarkdownTemplate = (raw: string): string => raw;

export async function createMarkdownDocument(
  raw: string
): Promise<MarkdownDocument> {
  const processor = remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false });
  const ast = processor.parse(raw);

  const toc: TocEntry[] = [];
  visit(ast, 'heading', node => {
    const heading = node as { depth?: number };
    if (!heading.depth || heading.depth > 3) return;
    const title = toString(node as Parameters<typeof toString>[0]).trim();
    if (!title) return;
    toc.push({ id: slugifyHeading(title), title, level: heading.depth });
  });

  const html = String(await processor.process(raw));
  return { html, toc };
}

export async function getMarkdownDocument(): Promise<MarkdownDocument> {
  throw new Error(
    'getMarkdownDocument reads the filesystem and is not available in Storybook. Use createMarkdownDocument instead.'
  );
}
