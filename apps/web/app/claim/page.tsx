import { Button } from '@jovie/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_NAME } from '@/constants/app';
import { SUPPORT_EMAIL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';
import {
  CLAIM_CHECKOUT_HREF,
  type ClaimPageState,
  parseClaimPageState,
} from '@/lib/claim/artist-offer-claim';
import { ClaimArtistSearch } from './ClaimArtistSearch';

const PRO_CLAIM = getPublicPriceClaim('pro');
const PRICE_DISPLAY = formatPublicPriceDisplay(PRO_CLAIM);

export const metadata: Metadata = {
  title: `Claim your artist profile | ${APP_NAME}`,
  description: `Find or create your artist profile and get ${PRO_CLAIM.displayName} for ${PRICE_DISPLAY}.`,
};

interface StateCopy {
  readonly title: string;
  readonly body: string;
  readonly action: { readonly label: string; readonly href: string } | null;
}

const STATE_COPY: Record<ClaimPageState, StateCopy> = {
  already_claimed: {
    title: 'Profile Already Claimed',
    body: 'If it is yours, sign in to manage it. Otherwise, search again.',
    action: { label: 'Sign In', href: APP_ROUTES.SIGNIN },
  },
  verification_required: {
    title: 'Verification Required',
    body: `Well-known artists are verified by our team before anyone can claim them. Email ${SUPPORT_EMAIL} from an address tied to the artist and we will confirm ownership first. You will not be charged until then.`,
    action: {
      label: 'Email Support',
      href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Artist profile verification')}`,
    },
  },
  already_subscribed: {
    title: `${PRO_CLAIM.displayName} Is Active`,
    body: 'Your subscription is active. Nothing more to pay.',
    action: { label: 'Open Dashboard', href: APP_ROUTES.DASHBOARD },
  },
  checkout_canceled: {
    title: 'Checkout Canceled',
    body: 'You were not charged. Your profile is saved, so you can pick up where you left off.',
    action: { label: 'Resume Checkout', href: CLAIM_CHECKOUT_HREF },
  },
  unavailable: {
    title: 'Artist Lookup Unavailable',
    body: 'Artist lookup is unavailable right now. Try again in a minute.',
    action: null,
  },
};

export default async function ClaimPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const state = parseClaimPageState((await searchParams).state);
  const stateCopy = state ? STATE_COPY[state] : null;

  return (
    <StandaloneProductPage width='sm' centered>
      <div className='space-y-4' data-testid='claim-page'>
        {stateCopy ? (
          <ContentSurfaceCard data-testid={`claim-state-${state}`}>
            <ContentSectionHeader
              density='compact'
              title={stateCopy.title}
              subtitle={stateCopy.body}
            />
            {stateCopy.action ? (
              <div className='px-5 pb-5 sm:px-6'>
                <Button asChild variant='secondary' size='lg'>
                  <Link href={stateCopy.action.href}>
                    {stateCopy.action.label}
                  </Link>
                </Button>
              </div>
            ) : null}
          </ContentSurfaceCard>
        ) : null}

        <ContentSurfaceCard className='overflow-hidden'>
          <ContentSectionHeader
            headingLevel='h1'
            title='Claim Your Artist Profile'
            subtitle={`${PRO_CLAIM.displayName} is ${PRICE_DISPLAY}. Cancel anytime.`}
          />
          <div className='px-5 py-5 sm:px-6'>
            <ClaimArtistSearch />
          </div>
        </ContentSurfaceCard>
      </div>
    </StandaloneProductPage>
  );
}
