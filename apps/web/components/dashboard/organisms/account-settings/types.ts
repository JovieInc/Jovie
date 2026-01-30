/**
 * Account Settings Types
 *
 * Clerk resource type definitions for account settings components.
 */

export type ClerkEmailVerification = {
  status?: string;
};

export interface ClerkEmailAddressResource {
  id: string;
  emailAddress: string;
  verification?: ClerkEmailVerification | null;
  prepareVerification: (args: { strategy: 'email_code' }) => Promise<unknown>;
  attemptVerification: (args: {
    code: string;
  }) => Promise<ClerkEmailAddressResource>;
  destroy: () => Promise<void>;
}

export type ClerkSessionActivity = {
  browserName?: string | null;
  city?: string | null;
  country?: string | null;
};

export interface ClerkSessionResource {
  id: string;
  latestActivity?: ClerkSessionActivity | null;
  lastActiveAt?: Date | null;
  revoke: () => Promise<void>;
}

export interface ClerkUserResource {
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddressResource[];
  getSessions: () => Promise<ClerkSessionResource[]>;
  createEmailAddress: (args: {
    email: string;
  }) => Promise<ClerkEmailAddressResource>;
  update: (args: { primaryEmailAddressId: string }) => Promise<unknown>;
  reload: () => Promise<void>;
}

export type EmailStatus = 'idle' | 'sending' | 'code' | 'verifying';
