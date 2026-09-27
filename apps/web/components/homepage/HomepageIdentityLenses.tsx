// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
'use client';

import Image from 'next/image';
import { useState } from 'react';
import { FilterChip } from '@/components/molecules/filters/FilterChip';
import type { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

type HomepageIdentity = (typeof HOMEPAGE_LAUNCH_COPY.certified)['identity'];

/**
 * JOV-6300 "You are not one thing." treatment. One approved subject stays
 * constant while the caption emphasis switches across at most three
 * contextual lenses (listener / collaborator / investor). Bounded inside the
 * relationships chapter — not a standalone sticky section.
 */
export function HomepageIdentityLenses({
  identity,
}: Readonly<{ identity: HomepageIdentity }>) {
  const [activeId, setActiveId] = useState<
    HomepageIdentity['lenses'][number]['id']
  >(identity.lenses[0].id);
  const active =
    identity.lenses.find(lens => lens.id === activeId) ?? identity.lenses[0];
  const { subject } = identity;

  return (
    <div
      className='homepage-identity'
      data-homepage-testid='homepage-identity'
      data-homepage-identity-for='built'
    >
      <p className='homepage-identity__opening'>{identity.opening}</p>
      <figure className='homepage-identity__figure'>
        <span className='homepage-identity__portrait'>
          <Image
            alt={subject.portrait.alt}
            className='homepage-identity__portrait-image'
            height={subject.portrait.height}
            loading='lazy'
            sizes='(min-width: 768px) 96px, 72px'
            src={subject.portrait.src}
            width={subject.portrait.width}
          />
        </span>
        <figcaption className='homepage-identity__caption'>
          <span className='homepage-identity__name'>{subject.name}</span>
          <span className='homepage-identity__handle'>
            {subject.profileDisplay}
          </span>
          <span aria-live='polite' className='homepage-identity__emphasis'>
            {active.emphasis}
          </span>
        </figcaption>
      </figure>
      <ul aria-label='Perspectives' className='homepage-identity__lenses'>
        {identity.lenses.map(lens => (
          <li key={lens.id}>
            <FilterChip
              className='homepage-identity__lens'
              data-homepage-testid={`homepage-identity-lens-${lens.id}`}
              onClick={() => setActiveId(lens.id)}
              pressed={lens.id === active.id}
            >
              {lens.label}
            </FilterChip>
          </li>
        ))}
      </ul>
      <p className='homepage-identity__payoff'>{identity.payoff}</p>
    </div>
  );
}
