/** Epoch milliseconds, or null when the value is not a real timestamp. */
export function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number') return acceptEpochMs(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{10}$/.test(trimmed)) return acceptEpochMs(Number(trimmed) * 1000);
  if (/^\d{13}$/.test(trimmed)) return acceptEpochMs(Number(trimmed));
  if (/^\d+$/.test(trimmed)) return null;
  return acceptEpochMs(Date.parse(trimmed));
}

function acceptEpochMs(ms: number): number | null {
  if (!Number.isInteger(ms)) return null;
  // 2001-09-09 through 2286-11-20. Rejects seconds-as-millis and junk.
  if (ms < 1_000_000_000_000 || ms > 9_999_999_999_999) return null;
  return ms;
}

/**
 * Deploy time for the public build-info receipt.
 *
 * Ship now: a valid VERCEL_DEPLOYMENT_TIME, else the build-start epoch
 * compiled into the server, else JOVIE_BUILD_DEPLOYED_AT, else null.
 * Re-evaluate when: Vercel exposes deployment ready/createdAt without a token,
 * or a promotion reuses a build and prod age must start at promotion.
 * Then: prefer that promotion timestamp over the compiled build stamp.
 */
export function resolveDeployedAtMs(input: {
  readonly vercelDeploymentTime?: unknown;
  readonly generatedDeployedAt?: unknown;
  readonly buildDeployedAt?: unknown;
}): number | null {
  return (
    parseTimestampMs(input.vercelDeploymentTime) ??
    parseTimestampMs(input.generatedDeployedAt) ??
    parseTimestampMs(input.buildDeployedAt)
  );
}
