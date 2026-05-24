'use client';

import { ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { PublicMerchCard } from '@/lib/merch/types';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ProfileMerchCard({
  artist,
  card,
  className,
}: {
  readonly artist: Artist;
  readonly card: PublicMerchCard;
  readonly className?: string;
}) {
  const href = `/${artist.handle}/merch/${card.id}`;
  const imageUrl = card.primaryImageUrl || card.mockupUrls[0];

  return (
    <Link
      href={href}
      className={cn(
        'group block min-w-0 rounded-[8px] border border-white/10 bg-white/[0.055] p-2 text-left text-white transition-[background-color,border-color] duration-subtle hover:border-white/18 hover:bg-white/[0.075] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70',
        className
      )}
      data-testid='profile-merch-card'
    >
      <div className='flex min-h-[112px] gap-3'>
        <div className='relative h-28 w-24 shrink-0 overflow-hidden rounded-[6px] bg-black/40'>
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={card.title}
              fill
              sizes='96px'
              className='object-cover'
            />
          ) : (
            <div className='flex h-full w-full items-center justify-center'>
              <ShoppingBag className='h-6 w-6 text-white/60' />
            </div>
          )}
        </div>
        <div className='flex min-w-0 flex-1 flex-col justify-between py-0.5'>
          <div className='min-w-0'>
            <div className='mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase leading-none text-white/58 [letter-spacing:0]'>
              <ShoppingBag className='h-3 w-3 shrink-0' />
              <span>Merch</span>
            </div>
            <h3 className='line-clamp-2 text-[15px] font-semibold leading-tight text-white [letter-spacing:0]'>
              {card.title}
            </h3>
            <p className='mt-1 line-clamp-2 text-[12px] leading-snug text-white/62'>
              {card.productType}
            </p>
          </div>
          <div className='mt-2 flex items-center justify-between gap-2'>
            <span className='text-[13px] font-semibold text-white'>
              {formatPrice(card.retailPriceCents)}
            </span>
            <span className='rounded-full border border-white/12 px-2 py-1 text-[11px] font-medium text-white/78'>
              Buy
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
