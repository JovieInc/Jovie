import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  applyMarkdownTemplate,
  createMarkdownDocument,
} from '@/lib/docs/getMarkdownDocument';
import { getInvestorManifest } from '@/lib/investors/manifest';
import { getInvestorPortalAccess } from '@/lib/investors/portal-access';
import { readInvestorPrivateText } from '@/lib/investors/private-content';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { MemoContent } from '../../_components/MemoContent';

interface PageProps {
  readonly params: Promise<{ slug: string }>;
}

function stripHtmlTags(input: string): string {
  let result = '';
  let inTag = false;

  for (const char of input) {
    if (char === '<') {
      inTag = true;
      continue;
    }

    if (char === '>') {
      inTag = false;
      continue;
    }

    if (!inTag) {
      result += char;
    }
  }

  return result;
}

/**
 * Defense-in-depth: the portal layout is the primary gate; the page re-checks
 * the same request-cached access before reading any memo content.
 */
async function requireInvestorAccess(): Promise<void> {
  if (!(await getInvestorPortalAccess())) {
    notFound();
  }
}

/**
 * Dynamic memo pages for the investor portal.
 * Reads markdown from the private investor store based on manifest.json.
 * Beautiful prose styling with light/dark toggle and TOC.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await getInvestorManifest();
  // Never name a memo in the head of a response the visitor can't open.
  const page = (await getInvestorPortalAccess())
    ? manifest.pages.find(p => p.slug === slug)
    : undefined;

  return {
    title: page ? `${page.title} — Jovie Investors` : 'Not Found',
    robots: NOINDEX_ROBOTS,
  };
}

export default async function InvestorMemoPage({ params }: PageProps) {
  await requireInvestorAccess();

  const { slug } = await params;
  const manifest = await getInvestorManifest();
  const page = manifest.pages.find(p => p.slug === slug);

  if (!page) {
    notFound();
  }

  // Memo markdown is private: read from the private investor store, never the repo.
  let raw: string;
  try {
    raw = await readInvestorPrivateText(`content/investors/${page.file}`);
  } catch {
    notFound();
  }
  const doc = await createMarkdownDocument(applyMarkdownTemplate(raw));
  const toc = doc.toc
    .filter(entry => entry.level === 2)
    .map(entry => ({ id: entry.id, title: entry.title }));

  // Estimate reading time (~200 words per minute)
  const plainText = stripHtmlTags(doc.html).trim();
  const wordCount = plainText ? plainText.split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.round(wordCount / 200));

  return (
    <MemoContent
      title={page.title}
      readingTime={readingTime}
      html={doc.html}
      toc={toc}
    />
  );
}
