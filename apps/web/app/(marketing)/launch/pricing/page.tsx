import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, APP_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { publicEnv } from '@/lib/env-public';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = `Pricing — ${APP_NAME}`;
  const description =
    'Simple pricing. No surprises. Free and Pro plans for every stage of your music career.';

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
const growthPlanEnabled = publicEnv.NEXT_PUBLIC_FEATURE_GROWTH_PLAN === 'true';

const free = ENTITLEMENT_REGISTRY.free;
const pro = ENTITLEMENT_REGISTRY.pro;
const growth = ENTITLEMENT_REGISTRY.growth;

interface FeatureListProps {
  readonly features: readonly string[];
}

function FeatureList({ features }: FeatureListProps) {
  return (
    <ul className='space-y-1.5'>
      {features.map(feat => (
        <li
          key={feat}
          className='flex items-center gap-2 text-sm text-secondary-token'
        >
          <Check className='w-3.5 h-3.5 shrink-0' aria-hidden='true' />
          {feat}
        </li>
      ))}
    </ul>
  );
}

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
            <span className='text-secondary-token'>No surprises.</span>
          </h2>
        </div>
        <div
          className={`grid grid-cols-1 ${growthPlanEnabled ? 'md:grid-cols-3' : 'md:grid-cols-2'} border-t border-subtle`}
        >
          {/* Free */}
          <div className='py-12 md:pr-8 md:border-r md:border-subtle'>
            <div className='uppercase tracking-widest font-medium mb-3 text-xs text-tertiary-token'>
              {free.marketing.displayName}
            </div>
            <div className='font-medium text-[2.5rem] tracking-tight leading-none'>
              $0
            </div>
            <div className='mt-3 text-sm text-secondary-token leading-normal min-h-[2.5em]'>
              {free.marketing.tagline}
            </div>
            <div className='mt-6 pt-5 border-t border-subtle'>
              <div className='uppercase tracking-widest mb-3 text-[0.7rem] text-tertiary-token'>
                Included
              </div>
              <FeatureList features={free.marketing.features} />
            </div>
            <Link
              href={APP_ROUTES.SIGNUP}
              className='focus-ring inline-block mt-7 px-5 py-2.5 rounded-md font-medium text-sm transition-colors border border-subtle hover:bg-white/[0.04]'
            >
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div className='py-12 md:px-8 md:border-r md:border-subtle'>
            <div className='uppercase tracking-widest font-medium mb-3 text-xs text-tertiary-token'>
              {pro.marketing.displayName}
            </div>
            <div className='font-medium text-[2.5rem] tracking-tight leading-none'>
              ${pro.marketing.price!.monthly}{' '}
              <span className='text-base font-normal text-tertiary-token'>
                /mo
              </span>
            </div>
            <div className='mt-3 text-sm text-secondary-token leading-normal min-h-[2.5em]'>
              {pro.marketing.tagline}
            </div>
            <div className='mt-6 pt-5 border-t border-subtle'>
              <div className='uppercase tracking-widest mb-3 text-[0.7rem] text-tertiary-token'>
                Everything in Free, plus
              </div>
              <FeatureList features={pro.marketing.features} />
            </div>
            <Link
              href={`${APP_ROUTES.SIGNUP}?plan=pro`}
              className='marketing-cta focus-ring mt-7'
            >
              Get started
            </Link>
          </div>

          {growthPlanEnabled && (
            <div className='py-12 md:pl-8'>
              <div className='uppercase tracking-widest font-medium mb-3 text-xs text-tertiary-token'>
                {growth.marketing.displayName}
              </div>
              <div className='font-medium text-[2.5rem] tracking-tight leading-none'>
                ${growth.marketing.price!.monthly}{' '}
                <span className='text-base font-normal text-tertiary-token'>
                  /mo
                </span>
              </div>
              <div className='mt-3 text-sm text-secondary-token leading-normal min-h-[2.5em]'>
                {growth.marketing.tagline}
              </div>
              <div className='mt-6 pt-5 border-t border-subtle'>
                <div className='uppercase tracking-widest mb-3 text-[0.7rem] text-tertiary-token'>
                  Everything in Pro, plus
                </div>
                <FeatureList features={growth.marketing.features} />
              </div>
              <Link
                href={`${APP_ROUTES.SIGNUP}?plan=growth`}
                className='focus-ring inline-block mt-7 px-5 py-2.5 rounded-md font-medium text-sm transition-colors border border-subtle hover:bg-white/[0.04]'
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
