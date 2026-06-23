export type CapturePlatform = 'web' | 'ios';

export interface CaptureTarget {
  readonly platform: CapturePlatform;
  /** Web URL or iOS screenshot scenario name. */
  readonly value: string;
}

const CAPTURE_LINE_PATTERN = /^capture:\s*(web|ios)\s+(\S+)/im;

const CAPTURE_URL_PATTERN = /^capture\s+url:\s*(\S+)/im;

/**
 * Parse a taste-call capture target from a Linear issue description.
 *
 * Supported lines (case-insensitive):
 * - `Capture: web https://staging.jov.ie/app/dashboard`
 * - `Capture: ios profile-dashboard`
 * - `Capture URL: https://staging.jov.ie/app/dashboard`
 */
export function parseCaptureTarget(
  description: string | null | undefined
): CaptureTarget | null {
  if (!description) return null;

  const labeled = description.match(CAPTURE_LINE_PATTERN);
  if (labeled) {
    const platform = labeled[1]?.toLowerCase();
    const value = labeled[2]?.trim();
    if ((platform === 'web' || platform === 'ios') && value) {
      return { platform, value };
    }
  }

  const urlOnly = description.match(CAPTURE_URL_PATTERN);
  if (urlOnly?.[1]) {
    return { platform: 'web', value: urlOnly[1].trim() };
  }

  return null;
}
