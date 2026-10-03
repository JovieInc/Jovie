'use client';

import { Button, Input } from '@jovie/ui';
import { Cable } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { integrationsCopy as copy } from '@/data/integrationsCopy';
import {
  filterIntegrations,
  INTEGRATION_CATEGORIES,
  type IntegrationCategory,
} from '@/lib/integrations/catalog';

/** Shared by the public directory, account settings, and the operator system map. */
export function IntegrationDirectory() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<IntegrationCategory>('all');
  const entries = filterIntegrations(query, category);
  return (
    <div className='space-y-6' data-testid='integration-directory'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <fieldset
          className='flex flex-wrap gap-2'
          aria-label='Integration Categories'
        >
          {INTEGRATION_CATEGORIES.map(value => (
            <Button
              key={value}
              variant={category === value ? 'secondary' : 'ghost'}
              size='sm'
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {copy.categories[value]}
            </Button>
          ))}
        </fieldset>
        <div className='w-full sm:w-80 sm:shrink-0'>
          <Input
            ref={searchRef}
            type='search'
            aria-label={copy.search}
            placeholder={copy.search}
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
      </div>
      <p role='status' className='text-sm text-secondary-token'>
        {entries.length} integrations
      </p>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {entries.map(entry => (
          <ContentSurfaceCard
            key={entry.id}
            surface='nested'
            className='flex min-w-0 flex-col gap-4 p-5'
          >
            <div className='flex items-center gap-3'>
              {entry.catalog ? (
                <SocialIcon platform={entry.id} size={24} aria-hidden />
              ) : (
                <Cable className='size-6 text-secondary-token' aria-hidden />
              )}
              <h2 className='text-[length:var(--text-base)] font-medium tracking-normal text-primary-token'>
                {entry.name}
              </h2>
            </div>
            <p className='text-xs text-tertiary-token'>
              {entry.account
                ? copy.modes.account
                : entry.id === 'spotify'
                  ? copy.modes.spotify
                  : copy.modes.catalog}
            </p>
            <p className='flex-1 text-sm leading-relaxed text-secondary-token'>
              {entry.description}
            </p>
            <Link
              href={entry.setup.href}
              className='rounded-md py-3 text-sm font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
              aria-label={`${entry.setup.label}: ${entry.name}`}
            >
              {entry.setup.label}
            </Link>
          </ContentSurfaceCard>
        ))}
      </div>
      {entries.length === 0 && (
        <div className='py-12 text-center'>
          <p className='mb-4 text-secondary-token'>{copy.empty}</p>
          <Button
            variant='secondary'
            onClick={() => {
              setQuery('');
              setCategory('all');
              searchRef.current?.focus();
            }}
          >
            {copy.reset}
          </Button>
        </div>
      )}
    </div>
  );
}
