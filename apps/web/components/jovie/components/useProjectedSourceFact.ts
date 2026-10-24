'use client';

import { type ComponentType, useEffect, useState } from 'react';
import type { EnrichedFact } from '@/lib/profile-facts/enrichment';

type SourceFactCardComponent = ComponentType<{ readonly fact: EnrichedFact }>;

/**
 * The trigger can paint before this resolves. A missing projection hides the
 * source card, so a private or mismatched fact never becomes inspectable.
 */
export function useProjectedSourceFact(
  candidate: EnrichedFact | undefined,
  id: string
): {
  readonly sourceFact: EnrichedFact | undefined;
  readonly pending: boolean;
  readonly SourceFactCardView: SourceFactCardComponent | null;
} {
  const matches = candidate?.id === id;
  const [sourceFact, setSourceFact] = useState<EnrichedFact | undefined>();
  const [pending, setPending] = useState(Boolean(candidate && matches));
  const [SourceFactCardView, setSourceFactCardView] =
    useState<SourceFactCardComponent | null>(null);

  useEffect(() => {
    if (!candidate || candidate.id !== id) {
      setSourceFact(undefined);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    void import('@/lib/profile-facts/enrichment').then(module => {
      if (cancelled) return;
      setSourceFact(
        module.projectPublicEnrichedFacts([candidate], candidate.subject.id)[0]
      );
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [candidate, id]);

  useEffect(() => {
    if (!sourceFact) return;
    let cancelled = false;
    void import('./SourceFactCard').then(module => {
      if (!cancelled) setSourceFactCardView(() => module.SourceFactCard);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceFact]);

  return { sourceFact, pending, SourceFactCardView };
}
