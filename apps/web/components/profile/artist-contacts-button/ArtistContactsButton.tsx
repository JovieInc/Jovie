'use client';

import { FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { track } from '@/lib/analytics';
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

  if (!isEnabled) {
    return null;
  }

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
        <FileText className='h-4 w-4' aria-hidden='true' />
      </CircleIconButton>
    );
  }

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
          <FileText className='h-4 w-4' aria-hidden='true' />
        </CircleIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-72 rounded-xl border border-subtle bg-surface-0 p-2 shadow-lg backdrop-blur-xl'
      >
        <div className='px-2 pb-2 pt-1'>
          <p className='text-xs font-semibold text-primary-token'>Contacts</p>
          <p className='text-xs text-secondary-token'>{artistName}</p>
        </div>
        <DropdownMenuSeparator className='bg-transparent border-t border-subtle' />
        <div className='max-h-80 overflow-auto'>
          {available.map(contact => {
            const primary = primaryChannel(contact);
            return (
              <div
                key={contact.id}
                className='group/contact flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-1'
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
