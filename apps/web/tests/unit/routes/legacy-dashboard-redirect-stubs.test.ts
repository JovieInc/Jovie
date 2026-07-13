import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('legacy dashboard redirect stubs', () => {
  afterEach(() => {
    redirectMock.mockClear();
  });

  it('sends legacy dashboard root traffic to the canonical app dashboard', async () => {
    const { default: LegacyDashboardPage } = await import(
      '../../../app/app/(shell)/dashboard/page'
    );

    await LegacyDashboardPage();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
  });

  it('sends legacy links traffic to the canonical profile panel', async () => {
    const { default: LinksPage } = await import(
      '../../../app/app/(shell)/dashboard/links/page'
    );

    LinksPage();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.CHAT_PROFILE_PANEL);
  });

  it('sends legacy tipping traffic to the canonical artist pay settings', async () => {
    const { default: TippingRedirect } = await import(
      '../../../app/app/(shell)/dashboard/tipping/page'
    );

    TippingRedirect();

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`
    );
  });

  // Demoted-route continuity (6-item nav IA, GH #12634 / #12633 chunk 1.5):
  // routes that lost their primary nav slot must keep working via redirect.
  it('sends legacy audience traffic to the canonical audience route', async () => {
    const { default: LegacyAudienceRedirect } = await import(
      '../../../app/app/(shell)/dashboard/audience/page'
    );

    LegacyAudienceRedirect();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.AUDIENCE);
  });

  it('sends legacy tasks traffic to the canonical tasks route', async () => {
    const { default: LegacyTasksRedirect } = await import(
      '../../../app/app/(shell)/dashboard/tasks/page'
    );

    LegacyTasksRedirect();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.TASKS);
  });

  it('sends the demoted releases route to the Library releases view', async () => {
    const { default: ReleasesRedirect } = await import(
      '../../../app/app/(shell)/releases/page'
    );

    await ReleasesRedirect();

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.LIBRARY}?view=releases`
    );
  });

  it('sends legacy threads traffic to the canonical chats route', async () => {
    const { default: ThreadsRedirect } = await import(
      '../../../app/app/(shell)/threads/page'
    );

    await ThreadsRedirect();

    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.CHATS);
  });
});
