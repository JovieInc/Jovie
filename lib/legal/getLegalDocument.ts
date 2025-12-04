import { promises as fs } from 'fs';
import { toString } from 'mdast-util-to-string';
import path from 'path';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import remarkSlug from 'remark-slug';
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

export async function getLegalDocument(
  slug: LegalDocumentSlug
): Promise<LegalDocument> {
  const docInfo = LEGAL_DOCS[slug];
  if (!docInfo) {
    throw new Error(`Unknown legal document slug: ${slug}`);
  }

  const absolutePath = path.join(process.cwd(), docInfo.file);
  const raw = await fs.readFile(absolutePath, 'utf-8');

  const slugProcessor = remark().use(remarkSlug);
  const ast = slugProcessor.parse(raw);
  await slugProcessor.run(ast);

  const toc: TocEntry[] = [];
  visit(ast, 'heading', node => {
    if (!node.depth) return;
    const title = toString(node).trim();
    if (!title) return;
    const headingId = (node.data as { id?: string } | undefined)?.id;
    if (!headingId) return;
    if (node.depth > 3) return;
    toc.push({ id: headingId, title, level: node.depth });
  });

  const htmlResult = await remark()
    .use(remarkSlug)
    .use(remarkHtml)
    .process(raw);

  return {
    slug,
    title: docInfo.title,
    html: htmlResult.toString(),
    toc,
  };
}
