'use client';

import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import {
  DrawerLinkSection,
  SidebarLinkRow,
} from '@/components/molecules/drawer';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import type { ProviderKey } from '@/lib/discography/types';

export interface TrackPlatformLink {
  readonly key: string;
  readonly label: string;
  readonly url: string;
}

interface TrackPlatformLinksSectionProps {
  readonly providers: TrackPlatformLink[];
  readonly emptyMessage?: string;
}

export function TrackPlatformLinksSection({
  providers,
  emptyMessage = 'No platform links available for this track.',
}: TrackPlatformLinksSectionProps) {
  return (
    <DrawerLinkSection
      title='Available on'
      isEmpty={providers.length === 0}
      emptyMessage={emptyMessage}
    >
      <div className='space-y-1'>
        {providers.map(provider => (
          <SidebarLinkRow
            key={provider.key}
            icon={
              <ProviderIcon
                provider={provider.key as ProviderKey}
                className='h-4 w-4'
                aria-label={PROVIDER_LABELS[provider.key] ?? provider.label}
              />
            }
            label={PROVIDER_LABELS[provider.key] ?? provider.label}
            url={provider.url}
            deepLinkPlatform={provider.key}
          />
        ))}
      </div>
    </DrawerLinkSection>
  );
}
