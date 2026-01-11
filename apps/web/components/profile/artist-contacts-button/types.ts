import type { PublicContact, PublicContactChannel } from '@/types/contacts';

export interface ArtistContactsButtonProps {
  contacts: PublicContact[];
  artistHandle: string;
  artistName: string;
  onNavigate?: (url: string) => void;
}

export interface UseArtistContactsReturn {
  open: boolean;
  setOpen: (open: boolean) => void;
  available: PublicContact[];
  singleContact: boolean;
  performAction: (
    channel: PublicContactChannel,
    contact: PublicContact
  ) => void;
  onIconClick: () => void;
  primaryChannel: (contact: PublicContact) => PublicContactChannel;
  buildTerritoryLabel: (contact: PublicContact) => string;
  isEnabled: boolean;
}
