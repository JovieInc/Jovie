'use client';

import { type ComponentType, useEffect, useState } from 'react';
import type { EnrichedFact } from '@/lib/profile-facts/enrichment';

type SourceFactCardComponent = ComponentType<{ readonly fact: EnrichedFact }>;

export function useProjectedSourceFact(
  candidate: EnrichedFact | undefined,
  id: string
) {
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
    void import('../source-facts').then(module => {
      if (cancelled) return;
      setSourceFact(
        module.projectPublicEnrichedFacts([candidate], candidate.subject.id)[0]
      );
      setSourceFactCardView(() => module.SourceFactCard);
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [candidate, id]);

  return { sourceFact, pending, SourceFactCardView };
}
