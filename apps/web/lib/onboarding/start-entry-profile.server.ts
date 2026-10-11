import 'server-only';

import { captureWarning } from '@/lib/error-tracking';
import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';
import { getProfileWithLinks } from '@/lib/services/profile';
import {
  buildStartEntryProfile,
  readStartEntryHandle,
  type StartEntryProfile,
} from './start-entry-profile';

/**
 * Resolve `/start?handle=` into the visitor's real page. Any lookup failure
 * degrades to the plain composer instead of blocking onboarding.
 */
export async function resolveStartEntryProfile(
  params: Readonly<Record<string, string | string[] | undefined>>
): Promise<StartEntryProfile | null> {
  const handle = readStartEntryHandle(params);
  if (!handle || isReservedPublicProfileIdentity(handle)) return null;

  try {
    return buildStartEntryProfile(handle, await getProfileWithLinks(handle));
  } catch (error) {
    await captureWarning('[start] entry profile lookup failed', error, {
      operation: 'resolveStartEntryProfile',
    });
    return null;
  }
}
