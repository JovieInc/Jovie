import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { getInvestorManifest } from '@/lib/investors/manifest';
import { MemoContent } from '../_components/MemoContent';

interface PageProps {
  readonly params: Promise<{ slug: string }>;
}

/**
 * Dynamic memo pages for the investor portal.
 * Reads markdown from content/investors/ based on manifest.json.
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
  const { slug } = await params;
  const manifest = await getInvestorManifest();
  const page = manifest.pages.find(p => p.slug === slug);

  if (!page) {
    notFound();
  }

  const doc = await getMarkdownDocument(`content/investors/${page.file}`);
  const toc = doc.toc
    .filter(entry => entry.level === 2)
    .map(entry => ({ id: entry.id, title: entry.title }));

  // Estimate reading time (~200 words per minute)
  const wordCount = doc.html.replace(/<[^>]*>/g, '').split(/\s+/).length;
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
