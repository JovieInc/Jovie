import type { ContactChannel, ContactRole } from './db';

export type { ContactChannel, ContactRole };

export interface ContactResponsibilityAssignment {
  id: string;
  role: ContactRole;
  customLabel?: string | null;
  territories: string[];
  isActive: boolean;
  isPrimary: boolean;
  sortOrder: number;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface ContactResponsibilityAssignmentInput {
  id?: string;
  role: ContactRole;
  customLabel?: string | null;
  territories?: string[];
  isActive?: boolean;
  isPrimary?: boolean;
  sortOrder?: number;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface DashboardContact {
  id: string;
  creatorProfileId: string;
  /** Legacy-compatible projection of the selected responsibility. */
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
  responsibilities?: ContactResponsibilityAssignment[];
  /** A visible in-product fallback, never a persisted user person. */
  isSystemDefault?: boolean;
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
  responsibilities?: ContactResponsibilityAssignmentInput[];
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
