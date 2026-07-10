import { CheckCircle2, ChevronLeft, ShoppingBag, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { getMerchMvpEnabled } from '@/lib/flags/profile-variant';
import {
  getPublicMerchCard,
  incrementMerchCardView,
} from '@/lib/merch/service';
import { generateMerchStructuredData } from '@/lib/seo/structured-data';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import { MerchCheckoutForm } from './MerchCheckoutForm';

export const revalidate = 300;

interface Props {
  readonly params: Promise<{
    readonly username: string;
    readonly cardId: string;
  }>;
  readonly searchParams?: Promise<{
    readonly success?: string;
    readonly cancelled?: string;
  }>;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(username)
  );
}

async function loadMerchPage(username: string, cardId: string) {
  if (!isValidUsername(username)) {
    notFound();
  }

  const merchEnabled = await getMerchMvpEnabled(null);
  if (!merchEnabled) {
    notFound();
  }

  const result = await getPublicMerchCard({ username, merchCardId: cardId });
  if (!result) {
    notFound();
  }

  return result;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, cardId } = await params;

  try {
    const { profile, card } = await loadMerchPage(username, cardId);
    const artistName = profile.displayName || profile.username;
    const title = `${card.title} by ${artistName} | Jovie`;
    const description = `${card.productType} from ${artistName}.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: card.primaryImageUrl ? [{ url: card.primaryImageUrl }] : [],
      },
    };
  } catch {
    return {
      title: 'Merch | Jovie',
      robots: { index: false, follow: false },
    };
  }
}

export default async function MerchProductPage({
  params,
  searchParams,
}: Readonly<Props>) {
  const { username, cardId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { profile, card } = await loadMerchPage(username, cardId);
  const handle = profile.usernameNormalized || username.toLowerCase();
  const artistName = profile.displayName || profile.username;
  const imageUrl = card.primaryImageUrl || card.mockupUrls[0] || '';

  after(() => {
    void incrementMerchCardView(card.id).catch(() => undefined);
  });

  const productJsonLd = generateMerchStructuredData({
    title: card.title,
    description: card.description,
    imageUrl: imageUrl || null,
    artistName,
    handle,
    cardId: card.id,
    retailPriceCents: card.retailPriceCents,
  });

  return (
    <PublicPageShell
      headerVariant='minimal'
      mainClassName='bg-(--profile-stage-bg) text-white dark:text-white'
    >
      <script type='application/ld+json'>
        {safeJsonLdStringify(productJsonLd)}
      </script>
      <div className='min-h-[calc(100dvh-var(--public-shell-header-offset))] px-4 py-8 sm:px-6 lg:px-8'>
        <div className='mx-auto flex w-full max-w-6xl flex-col gap-6'>
          <Link
            href={`/${handle}`}
            className='inline-flex h-10 w-fit items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-app font-medium text-white/72 transition-[background-color,border-color,color] duration-subtle hover:border-white/18 hover:bg-white/[0.07] hover:text-white'
          >
            <ChevronLeft className='h-4 w-4' />
            {artistName}
          </Link>

          {resolvedSearchParams.success === '1' ? (
            <div className='flex min-h-12 items-center gap-3 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-app text-emerald-100'>
              <CheckCircle2 className='h-4 w-4 shrink-0' />
              <span>Order received. A confirmation email is on its way.</span>
            </div>
          ) : null}

          {resolvedSearchParams.cancelled === '1' ? (
            <div className='flex min-h-12 items-center gap-3 rounded-lg border border-white/12 bg-white/[0.05] px-4 py-3 text-app text-white/72'>
              <XCircle className='h-4 w-4 shrink-0' />
              <span>Checkout was cancelled. Your item is still available.</span>
            </div>
          ) : null}

          <div className='grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.72fr)] lg:items-start'>
            <div className='min-w-0'>
              <div className='relative aspect-[4/5] overflow-hidden rounded-lg border border-white/10 bg-black/35 shadow-[0_22px_90px_rgba(0,0,0,0.34)]'>
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={card.title}
                    fill
                    priority
                    sizes='(min-width: 1024px) 58vw, 100vw'
                    className='object-cover'
                  />
                ) : (
                  <div className='flex h-full w-full items-center justify-center'>
                    <ShoppingBag className='h-10 w-10 text-white/48' />
                  </div>
                )}
              </div>
            </div>

            <div className='min-w-0'>
              <div className='mb-5'>
                <p className='text-xs font-semibold uppercase leading-none text-white/50 [letter-spacing:0]'>
                  {card.productType}
                </p>
                <h1 className='mt-3 text-4xl font-semibold leading-[1.02] text-primary-token [letter-spacing:0] sm:text-[42px]'>
                  {card.title}
                </h1>
                <p className='mt-4 text-mid leading-6 text-white/64'>
                  {card.description}
                </p>
                <p className='mt-4 text-mid font-semibold text-primary-token'>
                  {formatPrice(card.retailPriceCents)}
                </p>
              </div>

              <MerchCheckoutForm card={card} handle={handle} />
            </div>
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}
