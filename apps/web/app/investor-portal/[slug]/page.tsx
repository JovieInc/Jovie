import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PROFILE_HOSTNAME } from '@/constants/domains';
import { getMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { getInvestorManifest } from '@/lib/investors/manifest';
import { MemoContent } from '../_components/MemoContent';

interface PageProps {
  readonly params: Promise<{ slug: string }>;
}

const INVESTOR_TOKEN_COOKIE = '__investor_token';

/**
 * Validate that the request is coming from the investor subdomain or has a valid
 * investor token cookie. Prevents access on the primary host without auth.
 */
async function requireInvestorAccess(): Promise<void> {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';

  // Allow access from investor subdomain (proxy.ts already validated the token)
  const isInvestorHost =
    host === `investors.${PROFILE_HOSTNAME}` ||
    host === 'investors.localhost' ||
    host === 'investors.localhost:3000' ||
    host === 'investors.jov.ie';

  if (isInvestorHost) return;

  // On the primary host, require a valid investor token cookie
  const cookieStore = await cookies();
  const token = cookieStore.get(INVESTOR_TOKEN_COOKIE)?.value;

  if (!token) {
    notFound();
  }

  // Validate token against DB
  const { db } = await import('@/lib/db');
  const { investorLinks } = await import('@/lib/db/schema/investors');
  const { eq, and } = await import('drizzle-orm');

  const [link] = await db
    .select({
      id: investorLinks.id,
      isActive: investorLinks.isActive,
      expiresAt: investorLinks.expiresAt,
    })
    .from(investorLinks)
    .where(
      and(eq(investorLinks.token, token), eq(investorLinks.isActive, true))
    )
    .limit(1);

  if (!link) {
    notFound();
  }

  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    notFound();
  }
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
  await requireInvestorAccess();

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
