/**
 * Bridge to the native haptic engine when this page runs inside the Jovie iOS
 * app's WKWebView (apps/ios PublicProfileBrowserView registers the
 * `jovieHaptics` script message handler). Browsers without it, including iOS
 * Safari and the Mac and desktop shells, get a no-op so callers fall back to
 * the Vibration API.
 */

export type NativeHapticStyle =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'error';

export const NATIVE_HAPTIC_HANDLER = 'jovieHaptics';

interface NativeHapticHandler {
  postMessage(message: { style: NativeHapticStyle }): void;
}

function readHandler(): NativeHapticHandler | null {
  if (typeof window === 'undefined') return null;
  const handlers = (
    window as unknown as {
      webkit?: { messageHandlers?: Record<string, NativeHapticHandler> };
    }
  ).webkit?.messageHandlers;
  const handler = handlers?.[NATIVE_HAPTIC_HANDLER];
  return typeof handler?.postMessage === 'function' ? handler : null;
}

/** True when a native engine took the haptic; false means use a fallback. */
export function postNativeHaptic(style: NativeHapticStyle): boolean {
  const handler = readHandler();
  if (!handler) return false;
  try {
    handler.postMessage({ style });
    return true;
  } catch {
    return false;
  }
}
