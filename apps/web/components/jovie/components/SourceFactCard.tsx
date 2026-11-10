'use client';
// @coverage-via apps/web/components/jovie/components/SourceEvidence.test.tsx

import { EntityCard } from '@/components/organisms/entity-card/EntityCard';
import {
  type EnrichedFact,
  publicSourceUrl,
} from '@/lib/profile-facts/enrichment';
import { sourceFactLabel } from '../source-fact-labels';

const SOURCE_KINDS = [
  [/track|release/, 'Music', 'music'],
  [/event/, 'Event', 'show'],
  [/book/, 'Book', 'merch'],
  [/publication/, 'Publication', 'alerts'],
  [/product/, 'Product', 'merch'],
  [/project/, 'Project', 'merch'],
  [/credential/, 'Credential', 'alerts'],
  [/social/, 'Social Account', 'person'],
  [/website/, 'Website', 'alerts'],
] as const;

export function SourceFactCard({ fact }: { readonly fact: EnrichedFact }) {
  const [, label, kind] =
    SOURCE_KINDS.find(([pattern]) => pattern.test(fact.predicate)) ??
    ([
      null,
      fact.value?.type === 'number' ? 'Metric' : 'Person',
      'person',
    ] as const);
  const source = fact.sourceRefs.find(ref => ref.status === 'available');
  const href = source ? publicSourceUrl(source.url) : null;
  return (
    <div data-testid='source-fact-card'>
      <EntityCard
        treatment='compact'
        media='none'
        className='rounded-none border-0 shadow-none'
        model={{
          id: fact.id,
          kind: kind,
          imageAlt: '',
          title: fact.subject.displayName ?? label,
          eyebrow: label,
          meta: sourceFactLabel(fact),
          secondaryMeta: `${fact.status} · ${fact.verification}`,
          interactive: true,
          cta: href ? { label: 'Open Source', href, external: true } : null,
        }}
      />
      <dl className='space-y-3 border-t border-subtle p-3 text-xs text-secondary-token'>
        {fact.sourceRefs.map(ref => (
          <div key={ref.id} className='space-y-1'>
            <dt>
              {ref.kind === 'direct'
                ? 'Direct source'
                : ref.kind === 'enrichment'
                  ? 'Indirect enrichment'
                  : 'Inference'}{' '}
              · {ref.provider ?? 'Unknown provider'}
            </dt>
            <dd>
              {ref.originUrl
                ? new URL(ref.originUrl).hostname
                : 'Origin unknown'}
            </dd>
            <dd>
              {ref.status} · {ref.freshness} · {ref.verification}
            </dd>
            <dd>
              Collected{' '}
              {ref.fetchedAt ? (
                <time dateTime={ref.fetchedAt}>{ref.fetchedAt}</time>
              ) : (
                'at an unknown time'
              )}
            </dd>
            {ref.asOf ? (
              <dd>
                As of <time dateTime={ref.asOf}>{ref.asOf}</time>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}
