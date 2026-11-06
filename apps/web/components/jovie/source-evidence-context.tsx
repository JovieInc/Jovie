'use client';
// @coverage-via apps/web/components/jovie/components/SourceEvidence.test.tsx

import { createContext, type ReactNode, useEffect, useState } from 'react';
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
    void import('./source-facts').then(module => {
      if (cancelled) return;
      setPublicFacts(module.projectPublicEnrichedFacts(facts, subjectId));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [facts]);

  return (
    <SourceEvidenceContext.Provider value={publicFacts}>
      <div
        className='contents'
        data-source-evidence={ready ? 'ready' : 'pending'}
      >
        {children}
      </div>
    </SourceEvidenceContext.Provider>
  );
}

const EMPTY_FACTS: ReadonlyMap<string, readonly EnrichedFact[]> = new Map();

export function useSourceFactsByMessage(
  messages: Parameters<typeof import('./source-facts').sourceFactsByMessage>[0]
) {
  const [result, setResult] = useState<{
    messages: typeof messages;
    facts: ReadonlyMap<string, readonly EnrichedFact[]>;
  }>();
  useEffect(() => {
    if (messages.length === 0) return;
    let cancelled = false;
    void import('./source-facts').then(module => {
      if (!cancelled)
        setResult({ messages, facts: module.sourceFactsByMessage(messages) });
    });
    return () => {
      cancelled = true;
    };
  }, [messages]);
  return result?.messages === messages ? result.facts : EMPTY_FACTS;
}
