'use client';

import {
  EntityCard,
  type EntityCardModel,
} from '@/components/organisms/entity-card';
import {
  type EnrichedFact,
  publicSourceUrl,
} from '@/lib/profile-facts/enrichment';
import { sourceFactLabel } from '../source-facts';

function sourceKind(fact: EnrichedFact): {
  label: string;
  kind: EntityCardModel['kind'];
} {
  const predicate = fact.predicate;
  if (/track|release/.test(predicate)) return { label: 'Music', kind: 'music' };
  if (/event/.test(predicate)) return { label: 'Event', kind: 'show' };
  if (/book/.test(predicate)) return { label: 'Book', kind: 'merch' };
  if (/publication/.test(predicate))
    return { label: 'Publication', kind: 'alerts' };
  if (/product/.test(predicate)) return { label: 'Product', kind: 'merch' };
  if (/project/.test(predicate)) return { label: 'Project', kind: 'merch' };
  if (/credential/.test(predicate))
    return { label: 'Credential', kind: 'alerts' };
  if (/social/.test(predicate))
    return { label: 'Social Account', kind: 'person' };
  if (/website/.test(predicate)) return { label: 'Website', kind: 'alerts' };
  if (fact.value?.type === 'number') return { label: 'Metric', kind: 'person' };
  return { label: 'Person', kind: 'person' };
}

export function SourceFactCard({ fact }: { readonly fact: EnrichedFact }) {
  const category = sourceKind(fact);
  const source = fact.sourceRefs.find(ref => ref.status === 'available');
  const href = source ? publicSourceUrl(source.url) : null;
  const label = sourceFactLabel(fact);
  return (
    <div data-testid='source-fact-card'>
      <EntityCard
        treatment='compact'
        media='none'
        className='rounded-none border-0 shadow-none'
        model={{
          id: fact.id,
          kind: category.kind,
          imageAlt: '',
          title: fact.subject.displayName ?? category.label,
          eyebrow: category.label,
          meta: label ?? 'Source unavailable',
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
