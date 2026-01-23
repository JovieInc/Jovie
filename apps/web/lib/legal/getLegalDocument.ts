import path from 'path';
import { getMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import type { TocEntry as DocsTocEntry, MarkdownDocument } from '@/types/docs';

const LEGAL_DOCS = {
  privacy: {
    title: 'Privacy Policy',
    file: path.join('content', 'legal', 'privacy.md'),
  },
  terms: {
    title: 'Terms of Service',
    file: path.join('content', 'legal', 'terms.md'),
  },
  cookies: {
    title: 'Cookie Policy',
    file: path.join('content', 'legal', 'cookies.md'),
  },
} as const;

export type LegalDocumentSlug = keyof typeof LEGAL_DOCS;

export type TocEntry = DocsTocEntry;

export interface LegalDocument extends MarkdownDocument {
  slug: LegalDocumentSlug;
  title: string;
}

export async function getLegalDocument(
  slug: LegalDocumentSlug
): Promise<LegalDocument> {
  const docInfo = LEGAL_DOCS[slug];
  if (!docInfo) {
    throw new Error(`Unknown legal document slug: ${slug}`);
  }

  const doc = await getMarkdownDocument(docInfo.file);

  return {
    slug,
    title: docInfo.title,
    ...doc,
  };
}
