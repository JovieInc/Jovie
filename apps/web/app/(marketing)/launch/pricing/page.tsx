import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, APP_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `Pricing — ${APP_NAME}`;
  const description =
    'Simple pricing. No credits. No per-message fees. No surprises. Free, Pro, and Team plans for every stage of your music career.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/launch/pricing`,
      siteName: APP_NAME,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: `${APP_URL}/launch/pricing` },
  };
}

const WRAP = 'mx-auto max-w-[1100px] px-6';

export default function PricingPage() {
  return (
    <div className='section-spacing-linear'>
      <section aria-labelledby='pricing-heading' className={WRAP}>
        <div className='pb-8'>
          <h2
            id='pricing-heading'
            className='marketing-h2-linear max-w-[680px]'
          >
            Simple pricing.{' '}
            <span className='text-[var(--linear-text-secondary)]'>
              No credits. No per-message fees. No surprises.
            </span>
          </h2>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-3 border-t border-[var(--linear-border-subtle)]'>
          {/* Free */}
          <div className='py-12 md:pr-8 md:border-r md:border-[var(--linear-border-subtle)]'>
            <div className='uppercase tracking-widest font-medium mb-3 text-xs text-[var(--linear-text-tertiary)]'>
              Free
            </div>
            <div className='font-medium text-[2.5rem] tracking-tight leading-none'>
              $0
            </div>
            <div className='mt-3 text-sm text-[var(--linear-text-secondary)] leading-normal min-h-[2.5em]'>
              Everything you need to get live and start capturing fans.
            </div>
            <div className='mt-6 pt-5 border-t border-[var(--linear-border-subtle)]'>
              <div className='uppercase tracking-widest mb-3 text-[0.7rem] text-[var(--linear-text-tertiary)]'>
                Included
              </div>
              <ul className='space-y-1.5'>
                {[
                  'One-click Spotify import',
                  '5 active smart links',
                  'Link-in-bio with adaptive CTA',
                  'All deeplinks (/tip, /tour, /contact, etc.)',
                  'Email fan capture',
                  'Basic analytics',
                  'AI assistant (10 queries/mo)',
                ].map(feat => (
                  <li
                    key={feat}
                    className='flex items-center gap-2 text-sm text-[var(--linear-text-secondary)]'
                  >
                    <span className='text-[0.7rem]' aria-hidden='true'>
                      &check;
                    </span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='focus-ring inline-block mt-7 px-5 py-2.5 rounded-md font-medium text-sm transition-colors border border-[var(--linear-border-subtle)] hover:bg-white/[0.04]'
            >
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div className='py-12 md:px-8 md:border-r md:border-[var(--linear-border-subtle)]'>
            <div className='uppercase tracking-widest font-medium mb-3 text-xs text-[var(--linear-text-tertiary)]'>
              Pro
            </div>
            <div className='font-medium text-[2.5rem] tracking-tight leading-none'>
              $39{' '}
              <span className='text-base font-normal text-[var(--linear-text-tertiary)]'>
                /mo
              </span>
            </div>
            <div className='mt-3 text-sm text-[var(--linear-text-secondary)] leading-normal min-h-[2.5em]'>
              For artists serious about growing an audience they own.
            </div>
            <div className='mt-6 pt-5 border-t border-[var(--linear-border-subtle)]'>
              <div className='uppercase tracking-widest mb-3 text-[0.7rem] text-[var(--linear-text-tertiary)]'>
                Everything in Free, plus
              </div>
              <ul className='space-y-1.5'>
                {[
                  'Unlimited smart links',
                  'Unlimited AI assistant',
                  'SMS fan capture',
                  'Advanced fan analytics + engagement scoring',
                  'Custom domain (yourdomain.com)',
                  'Remove Jovie branding',
                  'Pre-save pages',
                ].map(feat => (
                  <li
                    key={feat}
                    className='flex items-center gap-2 text-sm text-[var(--linear-text-secondary)]'
                  >
                    <span className='text-[0.7rem]' aria-hidden='true'>
                      &check;
                    </span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href={`${APP_ROUTES.SIGNUP}?plan=pro`}
              className='marketing-cta focus-ring mt-7'
            >
              Get started
            </Link>
            <div className='mt-4 text-xs text-[var(--linear-text-tertiary)] leading-snug'>
              Pays for itself after 1 new subscriber per month at $100 LTV.
            </div>
          </div>

          {/* Team */}
          <div className='py-12 md:pl-8'>
            <div className='uppercase tracking-widest font-medium mb-3 text-xs text-[var(--linear-text-tertiary)]'>
              Team
            </div>
            <div className='font-medium text-[2.5rem] tracking-tight leading-none'>
              $99{' '}
              <span className='text-base font-normal text-[var(--linear-text-tertiary)]'>
                /mo
              </span>
            </div>
            <div className='mt-3 text-sm text-[var(--linear-text-secondary)] leading-normal min-h-[2.5em]'>
              For managers and labels running multiple artists.
            </div>
            <div className='mt-6 pt-5 border-t border-[var(--linear-border-subtle)]'>
              <div className='uppercase tracking-widest mb-3 text-[0.7rem] text-[var(--linear-text-tertiary)]'>
                Everything in Pro, plus
              </div>
              <ul className='space-y-1.5'>
                {[
                  'Up to 10 artist profiles',
                  'Team member accounts',
                  'Consolidated fan dashboard',
                  'API access',
                  'Webhook integrations',
                  'Dedicated account manager',
                  'Bulk import tools',
                ].map(feat => (
                  <li
                    key={feat}
                    className='flex items-center gap-2 text-sm text-[var(--linear-text-secondary)]'
                  >
                    <span className='text-[0.7rem]' aria-hidden='true'>
                      &check;
                    </span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href={`${APP_ROUTES.SIGNUP}?plan=team`}
              className='focus-ring inline-block mt-7 px-5 py-2.5 rounded-md font-medium text-sm transition-colors border border-[var(--linear-border-subtle)] hover:bg-white/[0.04]'
            >
              Get started
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
