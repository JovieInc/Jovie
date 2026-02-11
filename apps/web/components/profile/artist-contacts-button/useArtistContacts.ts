'use client';

import { useMemo } from 'react';
import { track } from '@/lib/analytics';
import { decodeContactPayload } from '@/lib/contacts/obfuscation';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import type { UseArtistContactsReturn } from './types';

interface UseArtistContactsOptions {
  contacts: PublicContact[];
  artistHandle: string;
  onNavigate?: (url: string) => void;
}

export function useArtistContacts({
  contacts,
  artistHandle,
  onNavigate,
}: UseArtistContactsOptions): UseArtistContactsReturn {
  const navigate =
    onNavigate ?? ((url: string) => globalThis.location.assign(url));

  const available = useMemo(
    () => contacts.filter(contact => contact.channels.length > 0),
    [contacts]
  );

  const performAction = (
    channel: PublicContactChannel,
    contact: PublicContact
  ) => {
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

    const normalized = (decoded.value ?? '').replaceAll(/[^\d+]/g, '');
    navigate(`tel:${normalized}`);
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
    available,
    performAction,
    onIconClick,
    primaryChannel,
    buildTerritoryLabel,
    isEnabled: available.length > 0,
  };
}
