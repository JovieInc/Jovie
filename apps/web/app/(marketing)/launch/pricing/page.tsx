import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingContainer,
  MarketingHero,
  MarketingPageShell,
} from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';
import { publicEnv } from '@/lib/env-public';

export const revalidate = false;

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Pricing';
  const ogTitle = `Pricing — ${APP_NAME}`;
  const description =
    'Simple pricing. No surprises. Free and Pro plans for every stage of your music career.';

  return {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      url: `${BASE_URL}/launch/pricing`,
      siteName: APP_NAME,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
    alternates: { canonical: `${BASE_URL}/launch/pricing` },
  };
}

const maxPlanEnabled = publicEnv.NEXT_PUBLIC_FEATURE_MAX_PLAN === 'true';

const free = ENTITLEMENT_REGISTRY.free;
const pro = ENTITLEMENT_REGISTRY.pro;
const max = ENTITLEMENT_REGISTRY.max;

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
    <MarketingPageShell>
      <MarketingHero variant='centered'>
        <h1 id='pricing-heading' className='marketing-h2-linear max-w-[680px]'>
          Simple pricing.{' '}
          <span className='text-secondary-token'>No surprises.</span>
        </h1>
      </MarketingHero>

      <MarketingContainer width='page'>
        <div
          className={`grid grid-cols-1 ${maxPlanEnabled ? 'md:grid-cols-3' : 'md:grid-cols-2'} border-t border-subtle`}
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
              Request Access
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
              className='public-action-primary focus-ring mt-7'
            >
              Request Access
            </Link>
          </div>

          {maxPlanEnabled && (
            <div className='py-12 md:pl-8'>
              <div className='uppercase tracking-widest font-medium mb-3 text-xs text-tertiary-token'>
                {max.marketing.displayName}
              </div>
              <div className='font-medium text-[2.5rem] tracking-tight leading-none'>
                ${max.marketing.price!.monthly}{' '}
                <span className='text-base font-normal text-tertiary-token'>
                  /mo
                </span>
              </div>
              <div className='mt-3 text-sm text-secondary-token leading-normal min-h-[2.5em]'>
                {max.marketing.tagline}
              </div>
              <div className='mt-6 pt-5 border-t border-subtle'>
                <div className='uppercase tracking-widest mb-3 text-[0.7rem] text-tertiary-token'>
                  Everything in Pro, plus
                </div>
                <FeatureList features={max.marketing.features} />
              </div>
              <Link
                href={`${APP_ROUTES.SIGNUP}?plan=max`}
                className='focus-ring inline-block mt-7 px-5 py-2.5 rounded-md font-medium text-sm transition-colors border border-subtle hover:bg-white/[0.04]'
              >
                Request Access
              </Link>
            </div>
          )}
        </div>
      </MarketingContainer>
    </MarketingPageShell>
  );
}
