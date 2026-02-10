'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { User, Users } from 'lucide-react';
import { useState } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { track } from '@/lib/analytics';
import { ContactDrawer } from './ContactDrawer';
import { ChannelIcon } from './ContactIcons';
import type { ArtistContactsButtonProps } from './types';
import { useArtistContacts } from './useArtistContacts';

export function ArtistContactsButton({
  contacts,
  artistHandle,
  artistName,
  onNavigate,
}: ArtistContactsButtonProps) {
  const {
    open,
    setOpen,
    available,
    singleContact,
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

  // Choose icon: User for single contact, Users for multiple
  const ContactIcon = singleContact ? User : Users;

  // Single contact: direct action on tap (no drawer/menu needed)
  if (singleContact) {
    const channel = available[0].channels[0];
    return (
      <CircleIconButton
        size='xs'
        variant='surface'
        ariaLabel='Contacts'
        data-contact-encoded={channel.encoded}
        data-testid='contacts-trigger'
        className='hover:scale-105'
        onClick={() => {
          onIconClick();
          performAction(channel, available[0]);
        }}
      >
        <ContactIcon className='h-4 w-4' aria-hidden='true' />
      </CircleIconButton>
    );
  }

  // Mobile: open bottom drawer
  if (isMobile) {
    return (
      <>
        <CircleIconButton
          size='xs'
          variant='surface'
          ariaLabel='Contacts'
          data-testid='contacts-trigger'
          className='hover:scale-105'
          onClick={() => {
            onIconClick();
            setDrawerOpen(true);
          }}
        >
          <ContactIcon className='h-4 w-4' aria-hidden='true' />
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

  // Desktop: dropdown menu
  return (
    <DropdownMenu
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) {
          onIconClick();
          track('contacts_menu_open', {
            handle: artistHandle,
            contacts_count: available.length,
          });
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <CircleIconButton
          size='xs'
          variant='surface'
          ariaLabel='Contacts'
          data-testid='contacts-trigger'
          className='hover:scale-105'
        >
          <ContactIcon className='h-4 w-4' aria-hidden='true' />
        </CircleIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-72'>
        <div className='px-2 pb-2 pt-1'>
          <p className='text-xs font-semibold text-primary-token'>Contacts</p>
          <p className='text-xs text-secondary-token'>{artistName}</p>
        </div>
        <DropdownMenuSeparator />
        <div className='max-h-80 overflow-auto'>
          {available.map(contact => {
            const primary = primaryChannel(contact);
            return (
              <div
                key={contact.id}
                className='group/contact flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors duration-150 ease-out hover:bg-surface-2'
              >
                <button
                  type='button'
                  className='flex flex-1 flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] rounded-md px-1'
                  data-contact-encoded={primary.encoded}
                  data-role={contact.role}
                  data-territories={contact.territoryCount}
                  onClick={() => performAction(primary, contact)}
                >
                  <span className='text-sm font-semibold text-primary-token'>
                    {buildTerritoryLabel(contact)}
                  </span>
                  {contact.secondaryLabel ? (
                    <span className='text-xs text-secondary-token'>
                      {contact.secondaryLabel}
                    </span>
                  ) : null}
                </button>
                <div className='flex items-center gap-1'>
                  {contact.channels.map(channel => (
                    <button
                      key={`${contact.id}-${channel.type}`}
                      type='button'
                      className='flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-primary-token hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] data-[preferred=true]:bg-surface-2'
                      data-contact-encoded={channel.encoded}
                      data-channel={channel.type}
                      data-preferred={channel.preferred ? 'true' : undefined}
                      aria-label={`${channel.type === 'email' ? 'Email' : 'Call'} ${contact.roleLabel}`}
                      onClick={() => performAction(channel, contact)}
                    >
                      <ChannelIcon type={channel.type} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
