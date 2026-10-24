import type { MenuItemConstructorOptions } from 'electron';
import {
  type ResolvedDesktopBuildIdentity,
  toDesktopBuildIdentityJson,
} from './build-identity';

interface NativeHelpMenuOptions {
  readonly identity: ResolvedDesktopBuildIdentity;
  readonly platform: string;
  readonly architecture: string;
  readonly openExternal: (url: string) => Promise<unknown>;
}

export function buildDesktopProblemReportUrl(
  options: Pick<NativeHelpMenuOptions, 'identity' | 'platform' | 'architecture'>
): string {
  // ContactSupport includes its full page URL in the user-prepared email draft.
  // The canonical serializer carries build metadata only, including nulls and
  // provenance; no account, session, or current-window data is attached.
  const url = new URL('https://docs.jov.ie/contact');
  url.searchParams.set(
    'desktopBuild',
    toDesktopBuildIdentityJson(options.identity).trim()
  );
  url.searchParams.set('platform', options.platform);
  url.searchParams.set('architecture', options.architecture);
  return url.toString();
}

export function buildNativeHelpMenu(
  options: NativeHelpMenuOptions
): MenuItemConstructorOptions {
  const browserLink = (
    label: string,
    url: string,
    enabled = true
  ): MenuItemConstructorOptions => ({
    label,
    enabled,
    click: () => {
      void options.openExternal(url);
    },
  });

  return {
    role: 'help',
    submenu: [
      browserLink('Jovie Support', 'https://jov.ie/support'),
      browserLink('Help Center', 'https://docs.jov.ie'),
      // JOV-8645: enable after the canonical status page recovers from its 404.
      browserLink('System Status', 'https://status.jov.ie', false),
      browserLink("What's New", 'https://jov.ie/changelog'),
      { type: 'separator' },
      // JOV-8644: enable after ContactSupport recovers from its production 500.
      browserLink(
        'Report a Problem',
        buildDesktopProblemReportUrl(options),
        false
      ),
    ],
  };
}
