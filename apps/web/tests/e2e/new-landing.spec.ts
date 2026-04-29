import { APP_ROUTES } from '@/constants/routes';
import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(180_000);

const REDIRECT_REQUEST_TIMEOUT = 120_000;

test.describe('retired marketing route redirects', () => {
  test('redirects /new to the canonical homepage', async ({ request }) => {
    const response = await request.get(APP_ROUTES.LANDING_NEW, {
      maxRedirects: 0,
      timeout: REDIRECT_REQUEST_TIMEOUT,
    });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(APP_ROUTES.HOME);
  });

  test('redirects retired experiment pages to Design Studio', async ({
    request,
  }) => {
    const homeV1 = await request.get('/exp/home-v1', {
      maxRedirects: 0,
      timeout: REDIRECT_REQUEST_TIMEOUT,
    });
    expect(homeV1.status()).toBe(308);
    expect(homeV1.headers().location).toBe(
      `${APP_ROUTES.EXP_DESIGN_STUDIO}?tab=landing`
    );

    const pageBuilder = await request.get('/exp/page-builder', {
      maxRedirects: 0,
      timeout: REDIRECT_REQUEST_TIMEOUT,
    });
    expect(pageBuilder.status()).toBe(308);
    expect(pageBuilder.headers().location).toBe(
      `${APP_ROUTES.EXP_DESIGN_STUDIO}?tab=landing`
    );

    const marketingSections = await request.get(
      APP_ROUTES.EXP_MARKETING_SECTIONS,
      {
        maxRedirects: 0,
        timeout: REDIRECT_REQUEST_TIMEOUT,
      }
    );
    expect(marketingSections.status()).toBe(308);
    expect(marketingSections.headers().location).toBe(
      APP_ROUTES.EXP_DESIGN_STUDIO
    );
  });
});
