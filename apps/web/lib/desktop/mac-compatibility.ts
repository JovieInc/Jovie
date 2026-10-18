import support from '../../../desktop/src/mac-support.json';

export const MAC_APP_SUPPORT = support;

export interface BrowserPlatform {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints: number;
}

export function isMacBrowser(platform: BrowserPlatform): boolean {
  return (
    /Macintosh|Mac OS X/.test(platform.userAgent) &&
    !/iPad|iPhone|iPod/.test(platform.userAgent) &&
    !(platform.platform === 'MacIntel' && platform.maxTouchPoints > 1)
  );
}

/** Frozen macOS 10_15_7 is not evidence of Catalina or native compatibility. */
export function macCompatibility(
  platform: BrowserPlatform,
  platformVersion?: string
): 'compatible' | 'incompatible' | 'unknown' | 'other' {
  if (!isMacBrowser(platform)) return 'other';
  if (/PPC|PowerPC/.test(platform.userAgent)) return 'incompatible';
  const version =
    platformVersion ||
    platform.userAgent.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/)?.[1];
  if (
    !version ||
    !/^\d+[._]\d+(?:[._]\d+)?$/.test(version) ||
    (!platformVersion && /^10[._]15[._]7$/.test(version))
  )
    return 'unknown';
  const major = Number(version.split(/[._]/)[0]);
  if (!Number.isInteger(major) || major < 10) return 'unknown';
  return major >= support.minimumMacOSMajor ? 'compatible' : 'incompatible';
}
