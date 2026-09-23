'use client';

import { useCallback, useEffect, useState } from 'react';
import { PaySection } from '@/components/organisms/PaySection';

export interface PayViewProps {
  readonly profileId?: string;
  readonly artistHandle: string;
  readonly venmoLink: string;
  readonly venmoUsername?: string | null;
  readonly amounts?: readonly number[];
}

/** The public Pay view shares the fixed-action dial with music Smart Links. */
export function PayView({
  profileId,
  artistHandle,
  venmoLink,
  venmoUsername,
  amounts = [5, 10, 20],
}: PayViewProps) {
  const [capability, setCapability] = useState<{
    key: string;
    profileId: string;
  } | null>(null);
  const lookupKey = profileId
    ? `profileId=${encodeURIComponent(profileId)}`
    : `handle=${encodeURIComponent(artistHandle)}`;
  const checkoutProfileId =
    capability?.key === lookupKey ? capability.profileId : null;

  useEffect(() => {
    const controller = new AbortController();
    const loadCapability = async () => {
      try {
        const response = await fetch(`/api/tips/create-checkout?${lookupKey}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!controller.signal.aborted) {
          const eligibleId =
            profileId ||
            (typeof result.profileId === 'string' ? result.profileId : null);
          setCapability(
            response.ok && result.available === true && eligibleId
              ? { key: lookupKey, profileId: eligibleId }
              : null
          );
        }
      } catch {
        if (!controller.signal.aborted) setCapability(null);
      }
    };
    void loadCapability();
    return () => controller.abort();
  }, [lookupKey, profileId]);

  const startStripeCheckout = useCallback(
    async (amount: number) => {
      if (!checkoutProfileId) throw new Error('Checkout unavailable');
      const response = await fetch('/api/tips/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: checkoutProfileId,
          handle: artistHandle,
          amountCents: Math.round(amount * 100),
        }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.url !== 'string') {
        throw new Error('Unable to start checkout');
      }
      const destination = new URL(result.url);
      if (
        destination.protocol !== 'https:' ||
        destination.hostname !== 'checkout.stripe.com'
      ) {
        throw new Error('Checkout returned an invalid destination');
      }
      globalThis.location.assign(destination.toString());
    },
    [artistHandle, checkoutProfileId]
  );

  return (
    <PaySection
      handle={artistHandle}
      amounts={[...amounts]}
      venmoLink={venmoLink}
      venmoUsername={venmoUsername}
      onStripePayment={checkoutProfileId ? startStripeCheckout : undefined}
    />
  );
}
