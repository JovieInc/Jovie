'use client';

import { Mail } from 'lucide-react';
import { useState } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
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

  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!isEnabled) {
    return null;
  }

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
