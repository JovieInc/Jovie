import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import AudiencePage, {
  buildAudienceContactsRedirectPath,
} from '@/app/app/(shell)/audience/page';

describe('legacy audience route', () => {
  it('preserves audience state while moving it into Contacts', () => {
    expect(
      buildAudienceContactsRedirectPath({
        view: 'identified',
        segments: ['fans', 'supporters'],
        tab: 'contacts',
      })
    ).toBe(
      `${APP_ROUTES.CONTACTS}?tab=audience&view=identified&segments=fans&segments=supporters`
    );
  });

  it('redirects old audience links to the Contacts audience view', async () => {
    await AudiencePage({ searchParams: Promise.resolve({ view: 'all' }) });

    expect(redirectMock).toHaveBeenCalledWith(
      `${APP_ROUTES.CONTACTS}?tab=audience&view=all`
    );
  });
});
