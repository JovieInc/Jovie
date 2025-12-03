'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { useFeatureGate } from '@statsig/react-bindings';
import { useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { decodeContactPayload } from '@/lib/contacts/obfuscation';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';

interface ArtistContactsButtonProps {
  contacts: PublicContact[];
  artistHandle: string;
  artistName: string;
  onNavigate?: (url: string) => void;
}

function ContactGlyph() {
  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 24 24'
      className='h-4 w-4'
      stroke='currentColor'
      fill='none'
      strokeWidth={1.5}
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M8.5 7.5h7m-7 3h7m-7 3h4.5M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z'
      />
    </svg>
  );
}

function ChannelIcon({ type }: { type: PublicContactChannel['type'] }) {
  if (type === 'phone') {
    return (
      <svg
        aria-hidden='true'
        viewBox='0 0 24 24'
        className='h-4 w-4'
        stroke='currentColor'
        fill='none'
        strokeWidth={1.5}
      >
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M8.25 4.5h-2a1 1 0 0 0-1 1V7m0 0v4m0-4h2.75m7-2.5h2a1 1 0 0 1 1 1V7m0 0v4m0-4h-2.75M8 15.5l1.5-1.5 2 2 3-3 2.5 2.5'
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 24 24'
      className='h-4 w-4'
      stroke='currentColor'
      fill='none'
      strokeWidth={1.5}
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M4.5 6.75l7.5 5.25 7.5-5.25m-15 0A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 17.25V6.75Z'
      />
    </svg>
  );
}

function buildTerritoryLabel(contact: PublicContact) {
  if (!contact.territorySummary) return contact.roleLabel;
  return `${contact.roleLabel} – ${contact.territorySummary}`;
}

export function ArtistContactsButton({
  contacts,
  artistHandle,
  artistName,
  onNavigate,
}: ArtistContactsButtonProps) {
  const gate = useFeatureGate(STATSIG_FLAGS.CONTACTS);
  const [open, setOpen] = useState(false);
  const navigate = onNavigate ?? ((url: string) => window.location.assign(url));

  const available = useMemo(
    () => contacts.filter(contact => contact.channels.length > 0),
    [contacts]
  );

  if (!gate.value || available.length === 0) {
    return null;
  }

  const singleContact =
    available.length === 1 && available[0].channels.length === 1;

  const triggerClass =
    'group flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 cursor-pointer ring-1 ring-black/5 dark:ring-white/10 bg-white/70 dark:bg-white/10 text-gray-800 dark:text-gray-100 hover:bg-white';

  const performAction = (
    channel: PublicContactChannel,
    contact: PublicContact
  ) => {
    if (open) {
      setOpen(false);
    }

    const decoded = decodeContactPayload(channel.encoded);
    if (!decoded) return;

    track('contacts_contact_click', {
      handle: artistHandle,
      role: contact.role,
      channel: channel.type,
      territory_count: contact.territoryCount,
    });

    if (decoded.type === 'email') {
      const subject = decoded.subject
        ? `?subject=${encodeURIComponent(decoded.subject)}`
        : '';
      navigate(`mailto:${decoded.value}${subject}`);
      return;
    }

    const normalized = decoded.value.replace(/[^\d+]/g, '');
    navigate(`tel:${normalized}`);
  };

  const onIconClick = () => {
    track('contacts_icon_click', {
      handle: artistHandle,
      contacts_count: available.length,
    });
  };

  if (singleContact) {
    const channel = available[0].channels[0];
    return (
      <button
        type='button'
        className={triggerClass}
        aria-label='Contacts'
        data-contact-encoded={channel.encoded}
        data-testid='contacts-trigger'
        onClick={() => {
          onIconClick();
          performAction(channel, available[0]);
        }}
      >
        <ContactGlyph />
      </button>
    );
  }

  const primaryChannel = (contact: PublicContact): PublicContactChannel => {
    return (
      contact.channels.find(channel => channel.preferred) ?? contact.channels[0]
    );
  };

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
        <button
          type='button'
          className={triggerClass}
          aria-label='Contacts'
          data-testid='contacts-trigger'
        >
          <ContactGlyph />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-72 rounded-xl border border-gray-200/60 bg-white/95 p-2 shadow-lg shadow-black/10 dark:border-white/10 dark:bg-gray-900/95 backdrop-blur-xl'
      >
        <div className='px-2 pb-2 pt-1'>
          <p className='text-xs font-semibold text-gray-700 dark:text-gray-200'>
            Contacts
          </p>
          <p className='text-xs text-gray-500 dark:text-gray-400'>
            {artistName}
          </p>
        </div>
        <DropdownMenuSeparator className='bg-gray-200/70 dark:bg-white/10' />
        <div className='max-h-80 overflow-auto'>
          {available.map(contact => {
            const primary = primaryChannel(contact);
            return (
              <div
                key={contact.id}
                className='group/contact flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-gray-100/70 dark:hover:bg-white/5'
              >
                <button
                  type='button'
                  className='flex flex-1 flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md px-1'
                  data-contact-encoded={primary.encoded}
                  data-role={contact.role}
                  data-territories={contact.territoryCount}
                  onClick={() => performAction(primary, contact)}
                >
                  <span className='text-sm font-semibold text-gray-800 dark:text-gray-100'>
                    {buildTerritoryLabel(contact)}
                  </span>
                  {contact.secondaryLabel ? (
                    <span className='text-xs text-gray-500 dark:text-gray-400'>
                      {contact.secondaryLabel}
                    </span>
                  ) : null}
                </button>
                <div className='flex items-center gap-1'>
                  {contact.channels.map(channel => (
                    <button
                      key={`${contact.id}-${channel.type}`}
                      type='button'
                      className='flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-gray-700 dark:text-gray-100 hover:bg-gray-200/60 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 data-[preferred=true]:bg-gray-200/80 dark:data-[preferred=true]:bg-white/10'
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
