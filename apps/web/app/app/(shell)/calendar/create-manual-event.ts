'use server';

import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { insertEvent } from '@/lib/events/insert';
import { resolveEventLocalStart } from '@/lib/events/local-start';
import { IN_PERSON_EVENT_TYPES } from '@/lib/events/manual-event-types';
import { normalizeTicketUrl } from '@/lib/events/ticket-url';
import { getDashboardDataEssential } from '../dashboard/actions';

const manualEventInput = z.strictObject({
  eventType: z.enum(IN_PERSON_EVENT_TYPES),
  title: z.string().trim().min(1).max(200),
  venueName: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100),
  country: z.string().trim().min(1).max(100),
  localStart: z.string().max(16),
  timezone: z.string().trim().min(1).max(100),
  ticketUrl: z.string().trim().max(2048),
});

export async function createManualEvent(
  expectedProfileId: string,
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return { ok: false, error: 'Sign in again to add an event.' };
  }

  const { selectedProfile, dashboardLoadError, needsOnboarding } =
    await getDashboardDataEssential();
  if (
    dashboardLoadError ||
    needsOnboarding ||
    !selectedProfile ||
    selectedProfile.id !== expectedProfileId
  ) {
    return { ok: false, error: 'Select the profile again before saving.' };
  }

  const parsed = manualEventInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Check the required event details and try again.',
    };
  }

  const { localStart, timezone, ticketUrl, region, ...details } = parsed.data;
  const startDate = resolveEventLocalStart(localStart, timezone);
  if (!startDate) {
    return {
      ok: false,
      error: 'Enter a valid venue timezone and a time that occurs once there.',
    };
  }

  const normalizedTicketUrl = normalizeTicketUrl(ticketUrl);
  if (ticketUrl && !normalizedTicketUrl) {
    return {
      ok: false,
      error: 'Enter a ticket link starting with http:// or https://.',
    };
  }

  try {
    await insertEvent({
      ...details,
      profileId: selectedProfile.id,
      provider: 'manual',
      startDate,
      startTime: localStart.slice(11),
      timezone,
      region: region || null,
      ticketUrl: normalizedTicketUrl,
    });
    return { ok: true };
  } catch (error) {
    void captureError('Manual event creation failed', error, {
      profileId: selectedProfile.id,
    });
    return { ok: false, error: 'Could not add the event. Try again.' };
  }
}
