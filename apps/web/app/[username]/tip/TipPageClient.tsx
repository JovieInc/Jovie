'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { cn } from '@/lib/utils';

const PRESET_AMOUNTS = [
  { label: '$3', cents: 300 },
  { label: '$5', cents: 500 },
  { label: '$10', cents: 1000 },
  { label: '$20', cents: 2000 },
] as const;

const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 50000;

interface TipPageClientProps {
  readonly profileId: string;
  readonly handle: string;
  readonly artistName: string;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
}

export function TipPageClient({
  profileId,
  handle,
  artistName,
  avatarUrl,
  bio,
}: TipPageClientProps) {
  const [selectedCents, setSelectedCents] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveCents = isCustom
    ? Math.round(Number.parseFloat(customAmount || '0') * 100)
    : selectedCents;

  const isValidAmount =
    effectiveCents >= MIN_AMOUNT_CENTS && effectiveCents <= MAX_AMOUNT_CENTS;

  const handlePresetClick = useCallback((cents: number) => {
    setSelectedCents(cents);
    setIsCustom(false);
    setCustomAmount('');
    setError(null);
  }, []);

  const handleCustomFocus = useCallback(() => {
    setIsCustom(true);
    setError(null);
  }, []);

  const handleCustomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow empty, digits, and one decimal point with up to 2 decimal places
      if (value === '' || /^\d+\.?\d{0,2}$/.test(value)) {
        setCustomAmount(value);
        setIsCustom(true);
        setError(null);
      }
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!isValidAmount || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tips/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          amountCents: effectiveCents,
          handle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isValidAmount, isLoading, profileId, effectiveCents, handle]);

  const bioSnippet = bio
    ? bio.slice(0, 120) + (bio.length > 120 ? '...' : '')
    : null;

  return (
    <div className='min-h-dvh bg-base flex flex-col items-center justify-center px-4 py-8'>
      <div className='w-full max-w-md mx-auto'>
        {/* Back link */}
        <Link
          href={`/${handle}`}
          className='inline-flex items-center gap-1.5 text-sm text-secondary-token hover:text-primary-token transition-colors mb-6'
        >
          <ArrowLeft className='h-4 w-4' aria-hidden />
          <span>Back to profile</span>
        </Link>

        {/* Artist card */}
        <div className='rounded-xl border border-white/[0.08] bg-surface-1 p-6 mb-6'>
          <div className='flex items-center gap-4 mb-4'>
            <div className='h-16 w-16 rounded-full overflow-hidden flex-shrink-0 bg-surface-2'>
              <ImageWithFallback
                src={avatarUrl}
                alt={artistName}
                width={64}
                height={64}
                className='h-full w-full object-cover'
                fallbackVariant='avatar'
              />
            </div>
            <div className='min-w-0'>
              <h1 className='text-lg font-semibold text-primary-token truncate'>
                {artistName}
              </h1>
              {bioSnippet && (
                <p className='text-sm text-tertiary-token mt-0.5 line-clamp-2'>
                  {bioSnippet}
                </p>
              )}
            </div>
          </div>

          <p className='text-sm text-secondary-token'>
            Support {artistName} by sending a tip. 100% of your tip goes
            directly to the artist.
          </p>
        </div>

        {/* Amount selector */}
        <div className='rounded-xl border border-white/[0.08] bg-surface-1 p-6'>
          <h2 className='text-sm font-medium text-secondary-token mb-4'>
            Select an amount
          </h2>

          {/* Preset buttons */}
          <div className='grid grid-cols-4 gap-2 mb-4'>
            {PRESET_AMOUNTS.map(({ label, cents }) => (
              <button
                key={cents}
                type='button'
                onClick={() => handlePresetClick(cents)}
                className={cn(
                  'h-11 rounded-lg text-sm font-medium transition-colors',
                  'border',
                  !isCustom && selectedCents === cents
                    ? 'bg-white/[0.1] border-white/[0.15] text-primary-token'
                    : 'bg-surface-2 border-white/[0.06] text-secondary-token hover:bg-white/[0.06]'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div className='relative mb-6'>
            <span className='absolute left-3 top-1/2 -translate-y-1/2 text-sm text-tertiary-token'>
              $
            </span>
            <input
              type='text'
              inputMode='decimal'
              placeholder='Custom amount'
              value={customAmount}
              onFocus={handleCustomFocus}
              onChange={handleCustomChange}
              className={cn(
                'w-full h-11 pl-7 pr-3 rounded-lg text-sm',
                'bg-surface-2 border text-primary-token placeholder:text-quaternary-token',
                'focus:outline-none focus:ring-1 focus:ring-white/[0.15]',
                'transition-colors',
                isCustom ? 'border-white/[0.15]' : 'border-white/[0.06]'
              )}
            />
          </div>

          {/* Validation message */}
          {isCustom && customAmount && !isValidAmount && (
            <p className='text-xs text-red-400 mb-3 -mt-3'>
              {effectiveCents < MIN_AMOUNT_CENTS
                ? 'Minimum tip is $1.00'
                : 'Maximum tip is $500.00'}
            </p>
          )}

          {/* Error message */}
          {error && (
            <div className='rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 mb-4'>
              <p className='text-xs text-red-400'>{error}</p>
            </div>
          )}

          {/* Send tip button */}
          <button
            type='button'
            onClick={handleSubmit}
            disabled={!isValidAmount || isLoading}
            className={cn(
              'w-full h-12 rounded-lg text-sm font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-white/[0.2] focus:ring-offset-2 focus:ring-offset-surface-1',
              isValidAmount && !isLoading
                ? 'bg-white text-black hover:bg-white/90 cursor-pointer'
                : 'bg-white/[0.08] text-quaternary-token cursor-not-allowed'
            )}
          >
            {isLoading
              ? 'Redirecting to checkout...'
              : isValidAmount
                ? `Send $${(effectiveCents / 100).toFixed(2)} Tip`
                : 'Select an amount'}
          </button>

          <p className='text-xs text-quaternary-token text-center mt-3'>
            Powered by Stripe. Secure payment processing.
          </p>
        </div>
      </div>
    </div>
  );
}
