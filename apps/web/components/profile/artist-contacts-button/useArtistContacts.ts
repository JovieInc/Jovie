'use client';

import { useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import type { UseArtistContactsReturn } from './types';

interface UseArtistContactsOptions {
  contacts: PublicContact[];
  artistHandle: string;
  onNavigate?: (url: string) => void;
}

const TRIGGER_CLASS =
  'group flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base) cursor-pointer ring-1 ring-(--color-border-subtle) bg-surface-0 text-primary-token hover:bg-surface-1';

export function useArtistContacts({
  contacts,
  artistHandle,
  onNavigate,
}: UseArtistContactsOptions): UseArtistContactsReturn {
  const gate = useFeatureGate(STATSIG_FLAGS.CONTACTS);
  const [open, setOpen] = useState(false);
  const navigate = onNavigate ?? ((url: string) => window.location.assign(url));

  const available = useMemo(
    () => contacts.filter(contact => contact.channels.length > 0),
    [contacts]
  );

  const singleContact =
    available.length === 1 && available[0].channels.length === 1;

  const performAction = (
    channel: PublicContactChannel,
    contact: PublicContact
  ) => {
    if (open) {
      setOpen(false);
    }

    // actionUrl is pre-built server-side (mailto: or tel: URL)
    if (!channel.actionUrl) return;

    track('contacts_contact_click', {
      handle: artistHandle,
      role: contact.role,
      channel: channel.type,
      territory_count: contact.territoryCount,
    });

    navigate(channel.actionUrl);
  };

  const onIconClick = () => {
    track('contacts_icon_click', {
      handle: artistHandle,
      contacts_count: available.length,
    });
  };

  const primaryChannel = (contact: PublicContact): PublicContactChannel => {
    return (
      contact.channels.find(channel => channel.preferred) ?? contact.channels[0]
    );
  };

  const buildTerritoryLabel = (contact: PublicContact): string => {
    if (!contact.territorySummary) return contact.roleLabel;
    return `${contact.roleLabel} – ${contact.territorySummary}`;
  };

  return {
    open,
    setOpen,
    available,
    singleContact,
    triggerClass: TRIGGER_CLASS,
    performAction,
    onIconClick,
    primaryChannel,
    buildTerritoryLabel,
    isEnabled: gate.value && available.length > 0,
  };
}
