'use client';

import {
  createContext,
  createElement,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import type { EnrichedFact } from '@/lib/profile-facts/enrichment';

export const SourceEvidenceContext = createContext<readonly EnrichedFact[]>([]);

export function SourceEvidenceProvider({
  facts,
  children,
}: {
  readonly facts: readonly EnrichedFact[];
  readonly children: ReactNode;
}) {
  const [publicFacts, setPublicFacts] = useState<readonly EnrichedFact[]>([]);
  const [ready, setReady] = useState(facts.length === 0);

  useEffect(() => {
    const subjectId = facts[0]?.subject.id;
    if (!subjectId) {
      setPublicFacts([]);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void import('@/lib/profile-facts/enrichment').then(module => {
      if (cancelled) return;
      setPublicFacts(module.projectPublicEnrichedFacts(facts, subjectId));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [facts]);

  return createElement(
    SourceEvidenceContext.Provider,
    { value: publicFacts },
    createElement(
      'div',
      {
        className: 'contents',
        'data-source-evidence': ready ? 'ready' : 'pending',
      },
      children
    )
  );
}
