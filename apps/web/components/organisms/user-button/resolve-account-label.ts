/**
 * Account label for the signed-in user. Never derives a name from the raw
 * email local part: an OTP user without a name would otherwise see something
 * like "john.doe+tag" as their account name.
 * Chain: real user name -> artist display name -> handle -> "Account".
 */
export const ACCOUNT_LABEL_FALLBACK = 'Account';

export interface AccountLabelInput {
  readonly artistName?: string | null;
  readonly artistHandle?: string | null;
  readonly fullName?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly username?: string | null;
}

export function resolveAccountLabel(input: AccountLabelInput): string {
  const clean = (v: string | null | undefined) => (v ?? '').trim();
  const fullName = clean(input.fullName);
  const first = clean(input.firstName);
  const last = clean(input.lastName);
  const parts = first && last ? `${first} ${last}` : first;
  const handle = clean(input.artistHandle);
  return (
    clean(input.artistName) ||
    fullName ||
    parts ||
    clean(input.username) ||
    (handle ? `@${handle.replace(/^@/, '')}` : '') ||
    ACCOUNT_LABEL_FALLBACK
  );
}
