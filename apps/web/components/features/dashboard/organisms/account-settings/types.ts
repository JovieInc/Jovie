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

/**
 * Better Auth `listSessions()` row shape (core session table columns; see
 * `better-auth/dist/api/routes/session.d.mts`). No Clerk equivalent — this
 * backs the live SessionManagementCard.
 */
export interface BetterAuthSessionResource {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface ClerkUserResource {
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddressResource[];
  externalAccounts: ClerkExternalAccountResource[];
  createEmailAddress: (args: {
    email: string;
  }) => Promise<ClerkEmailAddressResource>;
  update: (args: { primaryEmailAddressId: string }) => Promise<unknown>;
  reload: () => Promise<void>;
}

/**
 * Subset of Clerk's ExternalAccountResource type.
 * Only includes properties used by ConnectedAccountsCard for display and disconnect functionality.
 * For the full API, see: https://clerk.com/docs/references/javascript/external-account
 */
export interface ClerkExternalAccountResource {
  id: string;
  provider: string;
  emailAddress?: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string;
  verification?: ClerkEmailVerification | null;
  destroy: () => Promise<void>;
}

export type EmailStatus = 'idle' | 'sending' | 'code' | 'verifying';
