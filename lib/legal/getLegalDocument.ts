import { promises as fs } from 'fs';
import { toString } from 'mdast-util-to-string';
import path from 'path';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import { visit } from 'unist-util-visit';

const LEGAL_DOCS = {
  privacy: {
    title: 'Privacy Policy',
    file: path.join('content', 'legal', 'privacy.md'),
  },
  terms: {
    title: 'Terms of Service',
    file: path.join('content', 'legal', 'terms.md'),
  },
} as const;

export type LegalDocumentSlug = keyof typeof LEGAL_DOCS;

export interface TocEntry {
  id: string;
  title: string;
  level: number;
}

export interface LegalDocument {
  slug: LegalDocumentSlug;
  title: string;
  html: string;
  toc: TocEntry[];
}

type HeadingData = {
  hProperties?: {
    id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type HeadingNode = {
  depth?: number;
  data?: HeadingData;
};

export async function getLegalDocument(
  slug: LegalDocumentSlug
): Promise<LegalDocument> {
  const docInfo = LEGAL_DOCS[slug];
  if (!docInfo) {
    throw new Error(`Unknown legal document slug: ${slug}`);
  }

  const absolutePath = path.join(process.cwd(), docInfo.file);
  const raw = await fs.readFile(absolutePath, 'utf-8');

  const processor = remark().use(remarkHtml);
  const ast = processor.parse(raw);

  const toc: TocEntry[] = [];
  visit(ast, 'heading', node => {
    const heading = node as HeadingNode;
    if (!heading.depth) return;

    const title = toString(node as Parameters<typeof toString>[0]).trim();
    if (!title) return;
    if (heading.depth > 3) return;

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) return;

    const data: HeadingData = heading.data ?? {};
    const hProperties: HeadingData['hProperties'] = data.hProperties ?? {};
    hProperties.id = slug;
    data.hProperties = hProperties;
    heading.data = data;

    toc.push({ id: slug, title, level: heading.depth });
  });

  const transformed = await processor.run(ast);
  const htmlResult = processor.stringify(transformed as never);

  return {
    slug,
    title: docInfo.title,
    html: htmlResult.toString(),
    toc,
  };
}
