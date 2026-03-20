import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';
import { getMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { getInvestorManifest } from '@/lib/investors/manifest';
import { DeckViewer } from './_components/DeckViewer';

/**
 * Investor portal landing page.
 * Centered hero with personalized greeting, headline, and pitch deck.
 * Slides loaded server-side from content/investors/deck/slides/*.md.
 */
export default async function InvestorLandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('__investor_token')?.value;

  // Fetch investor name for personalized greeting
  let investorName: string | null = null;
  if (token) {
    const [link] = await db
      .select({ investorName: investorLinks.investorName })
      .from(investorLinks)
      .where(eq(investorLinks.token, token))
      .limit(1);
    investorName = link?.investorName ?? null;
  }

  // Load deck slides server-side from markdown files
  const manifest = await getInvestorManifest();
  const slides = await Promise.all(
    manifest.deck.slides.map(async filename => {
      try {
        const doc = await getMarkdownDocument(
          `content/investors/deck/slides/${filename}`
        );
        // Extract title from first h1 heading in TOC, fallback to filename
        const h1 = doc.toc.find(entry => entry.level === 1);
        const title =
          h1?.title ?? filename.replace(/^\d+-/, '').replace(/\.md$/, '');
        // Remove the h1 from the rendered HTML to avoid duplication
        const html = doc.html.replace(/<h1[^>]*>.*?<\/h1>/i, '');
        return { title, html };
      } catch {
        return null;
      }
    })
  );
  const validSlides = slides.filter(
    (s): s is { title: string; html: string } => s !== null
  );

  return (
    <div className='flex flex-col items-center px-4 pt-12 sm:px-6 sm:pt-16 lg:pt-20'>
      {/* Personalized greeting */}
      {investorName && (
        <p
          className='mb-4 text-[length:var(--text-2xl)] font-[var(--font-weight-medium)] text-[var(--color-text-secondary-token)]'
          style={{ letterSpacing: 'var(--tracking-normal)' }}
        >
          Hi {investorName}
        </p>
      )}

      {/* Main headline */}
      <h1
        className='max-w-3xl text-center text-[length:var(--text-5xl)] font-[var(--font-weight-bold)] leading-[var(--leading-tight)] text-[var(--color-text-primary-token)]'
        style={{
          letterSpacing: 'var(--tracking-tight)',
          fontFeatureSettings: 'var(--font-features)',
        }}
      >
        Jovie is the growth engine for music creators
      </h1>

      {/* Supporting one-liner */}
      <p className='mt-4 max-w-2xl text-center text-[length:var(--text-lg)] leading-[var(--leading-relaxed)] text-[var(--color-text-tertiary-token)]'>
        Turn every profile visit into a personalized funnel that captures fans,
        drives streams, and grows revenue — automatically.
      </p>

      {/* Pitch deck */}
      <div className='mt-12 w-full max-w-4xl sm:mt-16'>
        <DeckViewer slides={validSlides} />
      </div>
    </div>
  );
}
