'use client';

import { Button } from '@jovie/ui';
import { useEffect, useState } from 'react';
import {
  VISIBILITY_AUDIT_OFFER_PATH,
  type VisibleVisibilityAuditOffer,
} from '@/lib/visibility-audit/offer';

type OfferResponse = VisibleVisibilityAuditOffer | { readonly visible: false };

async function loadVisibilityAuditOffer(): Promise<VisibleVisibilityAuditOffer | null> {
  const response = await fetch(VISIBILITY_AUDIT_OFFER_PATH, {
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const body = (await response.json()) as OfferResponse;
  return body.visible ? body : null;
}

export function VisibilityAuditOffer({
  loadOffer = loadVisibilityAuditOffer,
}: {
  readonly loadOffer?: () => Promise<VisibleVisibilityAuditOffer | null>;
}) {
  const [offer, setOffer] = useState<VisibleVisibilityAuditOffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOffer()
      .then(next => {
        if (!cancelled) setOffer(next);
      })
      .catch(() => {
        if (!cancelled) setOffer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadOffer]);

  if (!offer) return null;

  return (
    <aside
      aria-label='Visibility Audit Offer'
      className='flex flex-col gap-3'
      data-testid='visibility-audit-offer'
    >
      <p className='text-sm text-secondary-token'>{offer.detail}</p>
      <Button variant='secondary' size='lg' asChild>
        <a href={offer.href}>{offer.label}</a>
      </Button>
    </aside>
  );
}
