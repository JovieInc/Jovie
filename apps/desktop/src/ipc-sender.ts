/**
 * Resolves which URL an IPC event is attributed to for the trust checks.
 *
 * `WebFrameMain.url` is the committed URL of the frame that sent the message —
 * exactly what the trust checks are meant to see. Chromium can report '' for a
 * still-live frame in edge cases (a chrome-error commit where the preload still
 * runs, IPC dispatched before the first commit, a lingering detached wrapper).
 * For the webContents' root frame, `webContents.getURL()` still reports the last
 * committed main-frame URL and is an equivalent fallback; for a subframe it
 * would report the *main frame's* URL, so a subframe with an empty url must
 * fail closed rather than inherit the main frame's trust.
 */
export interface IpcSenderFrameSnapshot {
  /** `WebFrameMain.url` — empty string in the Chromium edge cases above. */
  readonly url: string;
  /** `WebFrameMain.detached` — the frame was torn down but its wrapper persists. */
  readonly detached: boolean;
  /** True only when the sending frame is the webContents' root frame. */
  readonly isMainFrame: boolean;
}

export function resolveIpcSenderUrl(
  senderFrame: IpcSenderFrameSnapshot | null,
  webContentsUrl: string
): string {
  // Electron reports senderFrame null only after the frame navigated or was
  // destroyed — a stale message whose reply can no longer be delivered, so the
  // webContents' last committed URL is the only attributable address.
  if (senderFrame === null) return webContentsUrl;
  if (senderFrame.url !== '') return senderFrame.url;
  if (senderFrame.detached || !senderFrame.isMainFrame) return '';
  return webContentsUrl;
}
