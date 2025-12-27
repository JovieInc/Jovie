/**
 * Device Detection Utilities
 *
 * Provides utilities for detecting device type from user agent strings.
 * Used for analytics, audience tracking, and responsive behavior.
 */

export type DeviceType = 'mobile' | 'desktop' | 'tablet' | 'unknown';

/**
 * Infer device type from user agent string.
 *
 * @param userAgent - The user agent string from the request headers
 * @returns The detected device type
 *
 * @example
 * ```ts
 * import { inferDeviceType } from '@/lib/utils/device-detection';
 *
 * const deviceType = inferDeviceType(request.headers.get('user-agent'));
 * // Returns: 'mobile' | 'desktop' | 'tablet' | 'unknown'
 * ```
 */
export function inferDeviceType(userAgent: string | null): DeviceType {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  // Check for tablets first (before mobile, since some tablets include 'android')
  if (ua.includes('ipad') || ua.includes('tablet')) {
    return 'tablet';
  }

  // Check for mobile devices
  if (
    ua.includes('mobi') ||
    ua.includes('iphone') ||
    ua.includes('android') ||
    ua.includes('ipod')
  ) {
    return 'mobile';
  }

  // Default to desktop for everything else
  return 'desktop';
}

/**
 * Check if the device is a mobile device (phone or tablet).
 *
 * @param userAgent - The user agent string from the request headers
 * @returns True if the device is mobile or tablet
 */
export function isMobileDevice(userAgent: string | null): boolean {
  const deviceType = inferDeviceType(userAgent);
  return deviceType === 'mobile' || deviceType === 'tablet';
}

/**
 * Check if the device is a desktop.
 *
 * @param userAgent - The user agent string from the request headers
 * @returns True if the device is a desktop
 */
export function isDesktopDevice(userAgent: string | null): boolean {
  return inferDeviceType(userAgent) === 'desktop';
}
