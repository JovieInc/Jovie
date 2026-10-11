import { describe, expect, it } from 'vitest';
import { DesktopNavigationCoordinator } from '../src/navigation-coordinator';

const options = { appUrl: 'https://jov.ie', appEnv: 'production' } as const;
const chat = 'https://jov.ie/app/chat';
const settings = 'https://jov.ie/app/settings';

describe('desktop client navigation', () => {
  it('keeps Settings, notifications, and internal windows in the ready document', () => {
    const coordinator = new DesktopNavigationCoordinator();
    coordinator.setReady(1, true);
    for (const path of [
      '/app/settings',
      '/app/chat?id=123#message',
      '/app/chats',
    ]) {
      expect(
        coordinator.resolve(1, chat, `https://jov.ie${path}`, options)
      ).toEqual({
        kind: 'client',
        path,
      });
    }
  });

  it('loads a document for a cold or old renderer without routing support', () => {
    const coordinator = new DesktopNavigationCoordinator();
    expect(coordinator.resolve(1, chat, settings, options)).toEqual({
      kind: 'document',
      url: settings,
    });
    coordinator.setReady(1, true);
    expect(coordinator.resolve(2, chat, settings, options)?.kind).toBe(
      'document'
    );
    coordinator.setReady(1, false);
    expect(coordinator.resolve(1, chat, settings, options)?.kind).toBe(
      'document'
    );
  });

  it('retains hard transitions for auth, recovery and other hosted surfaces', () => {
    const coordinator = new DesktopNavigationCoordinator();
    coordinator.setReady(1, true);
    for (const current of [
      'data:text/html,splash',
      'https://jov.ie/hud',
      'https://jov.ie/desktop-auth',
      'https://jov.ie/app/%zz',
    ]) {
      expect(coordinator.resolve(1, current, settings, options)?.kind).toBe(
        'document'
      );
    }
    for (const path of ['/app/auth/callback', '/app/%61uth/callback', '/hud']) {
      expect(
        coordinator.resolve(1, chat, `https://jov.ie${path}`, options)?.kind
      ).toBe('document');
    }
  });

  it('never turns external, public-profile or unsafe URLs into app commands', () => {
    const coordinator = new DesktopNavigationCoordinator();
    coordinator.setReady(1, true);
    for (const target of [
      'https://evil.example/app/chat',
      'javascript:alert(1)',
      'https://jov.ie/pricing',
      'https://jov.ie/timwhite',
      'not a url',
      'https://jov.ie/app/%zz',
    ]) {
      expect(coordinator.resolve(1, chat, target, options)).toBeNull();
    }
  });

  it('hard-loads cross-origin local development transitions', () => {
    const coordinator = new DesktopNavigationCoordinator();
    coordinator.setReady(1, true);
    expect(
      coordinator.resolve(
        1,
        'http://localhost:3000/app/chat',
        'http://localhost:3100/app/settings',
        {
          appUrl: 'http://localhost:3000',
          appEnv: 'local',
        }
      )?.kind
    ).toBe('document');
  });
});
