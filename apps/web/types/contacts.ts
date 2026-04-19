import type { ContactChannel, ContactRole } from './db';

export type { ContactChannel, ContactRole };

export interface DashboardContact {
  id: string;
  creatorProfileId: string;
  role: ContactRole;
  customLabel?: string | null;
  personName?: string | null;
  companyName?: string | null;
  territories: string[];
  email?: string | null;
  phone?: string | null;
  preferredChannel?: ContactChannel | null;
  isActive: boolean;
  sortOrder: number;
}

export interface DashboardContactInput {
  id?: string;
  profileId: string;
  role: ContactRole;
  customLabel?: string | null;
  personName?: string | null;
  companyName?: string | null;
  territories: string[];
  email?: string | null;
  phone?: string | null;
  preferredChannel?: ContactChannel | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface PublicContactChannel {
  type: ContactChannel | 'sms';
  encoded: string;
  preferred?: boolean;
}

export interface PublicContact {
  id: string;
  role: ContactRole;
  roleLabel: string;
  territorySummary: string;
  territoryCount: number;
  territories?: readonly string[];
  companyLabel?: string;
  contactName?: string;
  secondaryLabel?: string;
  primaryContactLabel?: string;
  channels: PublicContactChannel[];
}
