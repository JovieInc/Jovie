'use client';

import { useId, useState } from 'react';
import type { ProfileRenderMode } from '@/features/profile/contracts';
import { buildVenmoPaymentUrl } from '@/features/profile/utils/venmo';
import type { ProfileCardAccentAssignment } from '@/lib/profile/mode-card-accent';
import { cn } from '@/lib/utils';
import { ProfileModeCard, ProfileModeCardAction } from './ProfileModeCard';

export const PROFILE_PAYMENT_AMOUNTS = Object.freeze([5, 10, 20] as const);
export const PROFILE_PAYMENT_DEFAULT_AMOUNT = 10;

function formatPaymentAmount(amount: number): string {
  return `$${amount}`;
}

export interface ProfilePaymentsCardProps {
  readonly artistName: string;
  /** The profile's Venmo link. The card renders nothing when it is unsafe. */
  readonly venmoLink: string | null;
  readonly accent: ProfileCardAccentAssignment;
  readonly amounts?: readonly number[];
  readonly defaultAmount?: number;
  readonly renderMode?: ProfileRenderMode;
}

/**
 * Payments mode card (Pen QZvG7): generalized "Pay {name}" with amount chips
 * and one neutral CTA that hands off to Venmo for the chosen amount. The
 * chips are a native radio group, so arrow keys, focus, and screen readers
 * work without custom key handling.
 */
export function ProfilePaymentsCard({
  artistName,
  venmoLink,
  accent,
  amounts = PROFILE_PAYMENT_AMOUNTS,
  defaultAmount = PROFILE_PAYMENT_DEFAULT_AMOUNT,
  renderMode = 'interactive',
}: Readonly<ProfilePaymentsCardProps>) {
  const groupName = useId();
  const initialAmount = amounts.includes(defaultAmount)
    ? defaultAmount
    : (amounts[0] ?? defaultAmount);
  const [amount, setAmount] = useState(initialAmount);
  const paymentUrl = buildVenmoPaymentUrl(venmoLink, amount);

  if (!paymentUrl) return null;

  const isInteractive = renderMode === 'interactive';
  const handlePay = () => {
    // Same retargeting pixel the pay drawer fires on a Venmo hand-off.
    // @ts-expect-error joviePixel is injected by JoviePixel
    globalThis.joviePixel?.track?.('tip_intent', {
      tipAmount: amount,
      tipMethod: 'venmo',
    });
  };

  return (
    <ProfileModeCard
      accent={accent}
      eyebrow='Payments'
      title={`Pay ${artistName}`}
      description={`Choose an amount to pay ${artistName}.`}
      dataTestId='profile-payments-card'
    >
      <fieldset
        className='grid grid-cols-3 gap-2'
        disabled={!isInteractive}
        data-testid='profile-payments-amounts'
      >
        <legend className='sr-only'>Payment amount</legend>
        {amounts.map(option => {
          const selected = option === amount;
          return (
            <label
              key={option}
              className='group flex h-11 cursor-pointer items-center'
            >
              <input
                type='radio'
                name={groupName}
                value={option}
                checked={selected}
                onChange={() => setAmount(option)}
                className='peer sr-only'
              />
              <span
                className={cn(
                  'flex h-8 w-full items-center justify-center rounded-full border text-mid tabular-nums transition-colors duration-subtle peer-focus-visible:ring-2 peer-focus-visible:ring-focus',
                  selected
                    ? 'border-(--profile-mode-card-hairline) bg-(--profile-mode-card-well-active) text-(--profile-mode-card-fg)'
                    : 'border-(--profile-mode-card-hairline) bg-(--profile-mode-card-well) text-(--profile-mode-card-muted) group-hover:text-(--profile-mode-card-fg)'
                )}
              >
                {formatPaymentAmount(option)}
              </span>
            </label>
          );
        })}
      </fieldset>
      <ProfileModeCardAction
        href={paymentUrl}
        external
        onClick={isInteractive ? handlePay : undefined}
        dataTestId='profile-payments-cta'
      >
        {`Pay ${formatPaymentAmount(amount)}`}
      </ProfileModeCardAction>
    </ProfileModeCard>
  );
}
