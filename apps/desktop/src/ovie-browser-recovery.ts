import {
  getUrlDisposition,
  matchesPathPrefix,
  parseUrl,
  type UrlDispositionOptions,
} from './navigation';

export interface OvieBrowserRecoveryRequest {
  readonly isMainWindow: boolean;
  readonly isMainFrame: boolean;
  readonly senderUrl: string;
  readonly currentUrl: string;
  readonly args: readonly unknown[];
  readonly options: UrlDispositionOptions;
}

/** No renderer URL argument: derive the browser destination from the live main page. */
export async function openCurrentOvieInBrowser(
  request: OvieBrowserRecoveryRequest,
  openExternal: (url: string) => Promise<unknown>
): Promise<{ readonly ok: boolean; readonly reason?: string }> {
  if (
    !request.isMainWindow ||
    !request.isMainFrame ||
    request.args.length !== 0
  )
    return { ok: false, reason: 'invalid-request' };
  const current = parseUrl(request.currentUrl);
  const sender = parseUrl(request.senderUrl);
  const app = parseUrl(request.options.appUrl);
  if (
    !current ||
    !sender ||
    !app ||
    current.origin !== app.origin ||
    sender.href !== current.href ||
    current.username ||
    current.password ||
    getUrlDisposition(current.href, request.options) !== 'in-app' ||
    !['/app/ov', '/app/admin', '/hud'].some(prefix =>
      matchesPathPrefix(current.pathname, prefix)
    )
  )
    return { ok: false, reason: 'blocked-url' };
  // Browser sessions have independent auth/privacy receipts. Carry only the
  // current route, never runtime flags, kiosk tokens, or auth handoff parameters.
  current.search = '';
  current.hash = '';
  try {
    await openExternal(current.href);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'open-external-failed' };
  }
}
