/**
 * Lead-built profiles stay private until certified or claimed.
 *
 * The lead pipeline builds pages for real prospect artists from public data.
 * A page nobody has vouched for must not be reachable or indexed under a real
 * artist's name. The hold is stored on the profile (`settings.leadBuild`) and
 * enforced by the `creator_profiles_lead_build_hold` trigger (migration 0162),
 * so no writer can publish around it. A claim (user_id / is_claimed) or an
 * explicit release after certification lifts it.
 */

export interface LeadBuildHold {
  readonly held: true;
  readonly reason: 'lead_built_uncertified';
  readonly heldAt: string;
}

export function buildLeadBuildHold(now: Date = new Date()): LeadBuildHold {
  return {
    held: true,
    reason: 'lead_built_uncertified',
    heldAt: now.toISOString(),
  };
}

/** True while a profile's settings carry an unreleased lead-build hold. */
export function isLeadBuildHeld(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const hold = (settings as Record<string, unknown>).leadBuild;
  if (!hold || typeof hold !== 'object') return false;
  const record = hold as Record<string, unknown>;
  return record.held === true && !record.releasedAt;
}

/** Merge the hold into existing settings without dropping other keys. */
export function withLeadBuildHold(
  settings: Record<string, unknown> | null | undefined,
  now: Date = new Date()
): Record<string, unknown> {
  return { ...(settings ?? {}), leadBuild: buildLeadBuildHold(now) };
}

/**
 * Settings that release the hold after the profile passes certification.
 * Callers still set is_public in the same UPDATE.
 */
export function withLeadBuildRelease(
  settings: Record<string, unknown> | null | undefined,
  now: Date = new Date()
): Record<string, unknown> {
  const current = settings?.leadBuild;
  const base =
    current && typeof current === 'object'
      ? (current as Record<string, unknown>)
      : {};
  return {
    ...(settings ?? {}),
    leadBuild: { ...base, held: true, releasedAt: now.toISOString() },
  };
}
