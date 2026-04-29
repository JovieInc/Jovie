import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
} from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getAlternative, getAlternativeSlugs } from '@/content/alternatives';
import { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/constants/schemas';

interface AlternativesPageProps {
  readonly params: Promise<{ slug: string }>;
}

export const revalidate = false;

export async function generateStaticParams() {
  return getAlternativeSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({
  params,
}: AlternativesPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getAlternative(slug);
  if (!data) return { title: 'Alternative' };

  return {
    title: data.title,
    description: data.metaDescription,
    alternates: {
      canonical: `${BASE_URL}/alternatives/${data.slug}`,
    },
    openGraph: {
      title: data.title,
      description: data.metaDescription,
      url: `${BASE_URL}/alternatives/${data.slug}`,
      type: 'website',
    },
  };
}

export default async function AlternativesPage({
  params,
}: AlternativesPageProps) {
  const { slug } = await params;
  const data = getAlternative(slug);
  if (!data) notFound();

  const faqSchema = buildFaqSchema(data.faq);
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: APP_NAME, url: BASE_URL },
    { name: 'Blog', url: `${BASE_URL}/blog` },
    { name: data.title, url: `${BASE_URL}/alternatives/${data.slug}` },
  ]);

  return (
    <>
      <script type='application/ld+json'>{faqSchema}</script>
      <script type='application/ld+json'>{breadcrumbSchema}</script>

      <MarketingHero variant='left'>
        <p className='marketing-kicker'>Alternative</p>
        <h1 className='marketing-h1-linear mt-6 max-w-[20ch] text-primary-token'>
          {data.heroHeadline}
        </h1>
        <p className='mt-6 max-w-[60ch] text-lg leading-relaxed text-secondary-token'>
          {data.heroSubheadline}
        </p>
      </MarketingHero>

      {/* Why Switch */}
      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <h2 className='text-2xl font-semibold text-primary-token'>
            Why musicians are switching
          </h2>
          <ul className='mt-6 space-y-4'>
            {data.whySwitch.map(reason => (
              <li
                key={reason}
                className='flex gap-3 text-base leading-relaxed text-secondary-token'
              >
                <span className='mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-token' />
                {reason}
              </li>
            ))}
          </ul>
        </section>
      </MarketingContainer>

      {/* Highlights */}
      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <h2 className='text-2xl font-semibold text-primary-token'>
            What you get with {APP_NAME}
          </h2>
          <div className='mt-6 grid gap-8 sm:grid-cols-2'>
            {data.highlights.map(highlight => (
              <div key={highlight.title}>
                <h3 className='font-medium text-primary-token'>
                  {highlight.title}
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                  {highlight.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </MarketingContainer>

      {/* CTA */}
      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <div className='rounded-xl border border-border-primary bg-surface-secondary p-8 text-center'>
            <h2 className='text-xl font-semibold text-primary-token'>
              Ready to try {APP_NAME}?
            </h2>
            <p className='mt-2 text-sm text-secondary-token'>
              Create your free profile in under a minute.
            </p>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='mt-6 inline-flex items-center rounded-lg bg-accent-token px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90'
            >
              Request Access
            </Link>
          </div>
        </section>
      </MarketingContainer>

      {/* FAQ */}
      <FaqSection items={data.faq} />
    </>
  );
}
