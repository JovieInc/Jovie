import type { Artist } from '@/types/db';

export interface VenmoEditState {
  artist: Artist | null;
  venmoHandle: string;
  isEditing: boolean;
  isSaving: boolean;
  saveSuccess: string | null;
}

export interface UseDashboardTippingReturn {
  artist: Artist | null;
  venmoHandle: string;
  setVenmoHandle: (value: string) => void;
  isEditing: boolean;
  setIsEditing: (value: boolean) => void;
  isSaving: boolean;
  saveSuccess: string | null;
  hasVenmoHandle: boolean;
  handleSaveVenmo: () => Promise<void>;
  handleCancel: () => void;
  handleDisconnect: () => Promise<void>;
}
