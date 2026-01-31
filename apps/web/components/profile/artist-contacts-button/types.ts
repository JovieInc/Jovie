import type { PublicContact, PublicContactChannel } from '@/types/contacts';

export interface ArtistContactsButtonProps {
  readonly contacts: PublicContact[];
  readonly artistHandle: string;
  readonly artistName: string;
  readonly onNavigate?: (url: string) => void;
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
