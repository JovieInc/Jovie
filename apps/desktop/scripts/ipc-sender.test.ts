import { describe, expect, test } from 'vitest';
import { resolveIpcSenderUrl } from '../src/ipc-sender.ts';

const APP_URL = 'https://jov.ie/app/chat?runtime=electron';

/**
 * JOV-5996: a live main frame whose WebFrameMain.url reads '' must fall back to
 * the webContents' committed URL so the trusted handoff (e.g. get-build-identity)
 * is not dropped. Subframes and detached frames with an empty url stay closed.
 */
describe('resolveIpcSenderUrl', () => {
  test('returns the committed frame url for an ordinary sender', () => {
    expect(
      resolveIpcSenderUrl(
        { url: APP_URL, detached: false, isMainFrame: true },
        APP_URL
      )
    ).toBe(APP_URL);
  });

  test('falls back to the webContents url when senderFrame is null', () => {
    expect(resolveIpcSenderUrl(null, APP_URL)).toBe(APP_URL);
  });

  test('falls back to the webContents url for a live main frame with an empty url', () => {
    expect(
      resolveIpcSenderUrl(
        { url: '', detached: false, isMainFrame: true },
        APP_URL
      )
    ).toBe(APP_URL);
  });

  test('fails closed for a subframe with an empty url', () => {
    expect(
      resolveIpcSenderUrl(
        { url: '', detached: false, isMainFrame: false },
        APP_URL
      )
    ).toBe('');
  });

  test('fails closed for a detached main frame with an empty url', () => {
    expect(
      resolveIpcSenderUrl(
        { url: '', detached: true, isMainFrame: true },
        APP_URL
      )
    ).toBe('');
  });

  test('keeps the detached frame url when it is still readable', () => {
    expect(
      resolveIpcSenderUrl(
        { url: APP_URL, detached: true, isMainFrame: true },
        'data:text/html,stale'
      )
    ).toBe(APP_URL);
  });
});
