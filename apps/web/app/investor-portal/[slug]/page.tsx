import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { getInvestorManifest } from '@/lib/investors/manifest';
import { MemoContent } from '../_components/MemoContent';

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
 * Defense-in-depth: verify investor token cookie exists.
 * Primary auth is handled by middleware (proxy.ts).
 */
async function requireInvestorAccess(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get('__investor_token')?.value;

  if (!token) {
    notFound();
  }
}

/**
 * Dynamic memo pages for the investor portal.
 * Reads markdown from investors/ based on manifest.json.
 * Beautiful prose styling with light/dark toggle and TOC.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await getInvestorManifest();
  const page = manifest.pages.find(p => p.slug === slug);

  return {
    title: page ? `${page.title} — Jovie Investors` : 'Not Found',
    robots: { index: false, follow: false },
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

  const doc = await getMarkdownDocument(`investors/${page.file}`);
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
