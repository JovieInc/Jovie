'use client';

import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { ContactDrawer } from './ContactDrawer';
import type { ArtistContactsButtonProps } from './types';
import { useArtistContacts } from './useArtistContacts';

export function ArtistContactsButton({
  contacts,
  artistHandle,
  artistName,
  onNavigate,
}: ArtistContactsButtonProps) {
  const {
    available,
    performAction,
    onIconClick,
    primaryChannel,
    buildTerritoryLabel,
    isEnabled,
  } = useArtistContacts({ contacts, artistHandle, onNavigate });

  const isMobile = useBreakpointDown('md');
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!isEnabled) {
    return null;
  }

  // Mobile: open bottom drawer (matches tip button pattern)
  if (isMobile) {
    return (
      <>
        <CircleIconButton
          size='md'
          variant='ghost'
          ariaLabel='Contacts'
          data-testid='contacts-trigger'
          className='border border-transparent hover:border-subtle hover:bg-surface-2'
          onClick={() => {
            onIconClick();
            setDrawerOpen(true);
          }}
        >
          <Mail className='h-4 w-4' aria-hidden='true' />
        </CircleIconButton>
        <ContactDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          artistName={artistName}
          artistHandle={artistHandle}
          contacts={available}
          performAction={performAction}
          primaryChannel={primaryChannel}
          buildTerritoryLabel={buildTerritoryLabel}
        />
      </>
    );
  }

  // Desktop: navigate to contact mode page (matches tip button pattern)
  return (
    <CircleIconButton
      size='md'
      variant='ghost'
      ariaLabel='Contacts'
      data-testid='contacts-trigger'
      className='border border-transparent hover:border-subtle hover:bg-surface-2'
      asChild
    >
      <Link href={`/${artistHandle}?mode=contact`}>
        <Mail className='h-4 w-4' aria-hidden='true' />
      </Link>
    </CircleIconButton>
  );
}
