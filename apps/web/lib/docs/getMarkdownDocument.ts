import { promises as fs } from 'fs';
import { toString } from 'mdast-util-to-string';
import path from 'path';
import { cache } from 'react';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import { visit } from 'unist-util-visit';
import { LEGAL_ENTITY_NAME } from '@/constants/app';
import type { MarkdownDocument, TocEntry } from '@/types/docs';

const slugifyHeading = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-+)|(-+$)/g, '');
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

const applyMarkdownTemplate = (raw: string): string => {
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

export async function createMarkdownDocument(
  raw: string
): Promise<MarkdownDocument> {
  const processor = remark().use(remarkHtml);
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

  return {
    html: htmlResult.toString(),
    toc,
  };
}

async function getMarkdownDocumentUncached(
  relativePath: string
): Promise<MarkdownDocument> {
  const absolutePath = path.join(process.cwd(), relativePath);
  const raw = applyMarkdownTemplate(await fs.readFile(absolutePath, 'utf-8'));

  return createMarkdownDocument(raw);
}

const getMarkdownDocumentCached = cache(
  async (relativePath: string): Promise<MarkdownDocument> => {
    const absolutePath = path.join(process.cwd(), relativePath);
    const raw = applyMarkdownTemplate(await fs.readFile(absolutePath, 'utf-8'));

    return createMarkdownDocument(raw);
  }
);
