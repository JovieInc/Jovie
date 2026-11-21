'use client';

import { IconButton } from '@jovie/ui';
import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
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
  const { available, onIconClick, primaryChannel, isEnabled } =
    useArtistContacts({ contacts, artistHandle, onNavigate });

  const isMobile = useBreakpointDown('md');
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!isEnabled) {
    return null;
  }

  // Mobile: open bottom drawer (matches tip button pattern)
  if (isMobile) {
    return (
      <>
        <IconButton
          size='lg'
          variant='ghost'
          ariaLabel='Contacts'
          data-testid='contacts-trigger'
          onClick={() => {
            onIconClick();
            setDrawerOpen(true);
          }}
        >
          <Mail className='h-4 w-4' aria-hidden='true' />
        </IconButton>
        <ContactDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          artistName={artistName}
          artistHandle={artistHandle}
          contacts={available}
          primaryChannel={primaryChannel}
        />
      </>
    );
  }

  // Desktop: navigate to contact mode page (matches tip button pattern)
  return (
    <IconButton
      size='lg'
      variant='ghost'
      ariaLabel='Contacts'
      data-testid='contacts-trigger'
      asChild
    >
      <Link href={`/${artistHandle}?mode=contact`} prefetch={false}>
        <Mail className='h-4 w-4' aria-hidden='true' />
      </Link>
    </IconButton>
  );
}
