import type { IpcRenderer } from 'electron';

const GET_FULL_SCREEN_STATE_CHANNEL = 'desktop-get-full-screen-state';
const FULL_SCREEN_STATE_CHANNEL = 'desktop-full-screen-changed';

interface PreloadDocument {
  readonly documentElement?: { dataset: Record<string, string | undefined> };
  addEventListener(
    type: 'DOMContentLoaded',
    callback: () => void,
    options: { once: true }
  ): void;
}
interface RootObserver {
  observe(target: PreloadDocument, options: { childList: true }): void;
  disconnect(): void;
}

/** Own native fullscreen chrome for this document, before React hydrates. */
export function installPreloadFullScreenState(
  ipcRenderer: Pick<IpcRenderer, 'on' | 'invoke'>
): void {
  // The main-process TS project deliberately excludes the DOM library.
  const { document, MutationObserver } = globalThis as unknown as {
    document?: PreloadDocument;
    MutationObserver?: new (callback: () => void) => RootObserver;
  };
  let fullScreen: boolean | undefined;
  let receivedChange = false;
  let observer: RootObserver | undefined;
  const apply = () => {
    const root = document?.documentElement;
    if (!root) return;
    root.dataset.electronFullscreenManaged = 'preload';
    if (fullScreen !== undefined) {
      root.dataset.electronFullscreen = String(fullScreen);
    }
    observer?.disconnect();
  };

  // Subscribe first: a newer transition must win over the initial IPC snapshot.
  ipcRenderer.on(FULL_SCREEN_STATE_CHANNEL, (_event, value: unknown) => {
    if (typeof value !== 'boolean') return;
    receivedChange = true;
    fullScreen = value;
    apply();
  });
  void ipcRenderer
    .invoke(GET_FULL_SCREEN_STATE_CHANNEL)
    .then((value: unknown) => {
      if (receivedChange || typeof value !== 'boolean') return;
      fullScreen = value;
      apply();
    })
    .catch(() => undefined);

  if (!document?.documentElement) {
    // A sandboxed preload can run before <html> exists. Observe its insertion
    // instead of waiting for the rest of the document to finish loading.
    if (document && MutationObserver) {
      observer = new MutationObserver(apply);
      observer.observe(document, { childList: true });
    }
    document?.addEventListener('DOMContentLoaded', apply, { once: true });
  }
  apply();
}
