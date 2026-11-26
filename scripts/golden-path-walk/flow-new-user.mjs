import assert from 'node:assert/strict';

/**
 * Record the signed-out claim through first value. The public profile must
 * belong to the artist and handle selected in this run.
 * @param {{
 *   page: import('playwright').Page,
 *   snap: (title: string, extra?: object) => Promise<void>,
 *   otp: (startedAt: number) => Promise<string>,
 *   email: string, ARTIST: string, ARTIST_SPOTIFY: string, ORIGIN: string
 * }} ctx
 */
export default async function flow({
  page,
  snap,
  otp,
  email,
  ARTIST,
  ARTIST_SPOTIFY,
  ORIGIN,
}) {
  const origin = new URL(ORIGIN).origin;
  const timeout = 60_000;
  const handle =
    process.env.REPLY1 ?? process.env.HANDLE ?? `gp${Date.now().toString(36)}`;
  assert.match(handle, /^[a-z0-9][a-z0-9_-]{0,29}$/u);

  let waitlistVisited = false;
  function recordNavigation(url) {
    const { pathname } = new URL(url);
    if (/^\/waitlist(?:\/|$)/u.test(pathname)) waitlistVisited = true;
  }
  /** @param {import('playwright').Request} request */
  function onRequest(request) {
    if (request.isNavigationRequest()) recordNavigation(request.url());
  }
  /** @param {import('playwright').Frame} frame */
  function onNavigation(frame) {
    if (frame === page.mainFrame()) recordNavigation(frame.url());
  }
  page.on('request', onRequest);
  page.on('framenavigated', onNavigation);

  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await snap('homepage');
    const reject = page.getByRole('button', { name: /reject all/i });
    if (await reject.isVisible()) await reject.click();

    await page
      .getByRole('link', { name: 'Claim your profile', exact: true })
      .and(page.getByTestId('homepage-primary-cta'))
      .click({ timeout });
    await page.waitForURL(
      url => url.origin === origin && url.pathname === '/start',
      { timeout }
    );
    await snap('claim chat');

    const input = page.getByLabel('Chat Message Input', { exact: true });
    const send = page.getByRole('button', {
      name: 'Send message',
      exact: true,
    });
    await input.fill(ARTIST_SPOTIFY, { timeout });
    await send.click({ timeout });
    await page
      .getByText(ARTIST, { exact: true })
      .filter({ visible: true })
      .first()
      .waitFor({ timeout });
    await page
      .locator(
        '[data-testid^="onboarding-profile-rail"][data-catalog-releases]:not([data-catalog-releases="0"]):visible'
      )
      .first()
      .waitFor({ timeout });
    await snap('artist catalog preview');

    // Some chat turns already offer a handle after the artist selection.
    const handleCard = page.getByTestId('onboarding-handle-check').last();
    if (!(await handleCard.isVisible())) {
      await input.fill('Set my profile handle', { timeout });
      await send.click({ timeout });
    }
    await handleCard.getByTestId('onboarding-edit-handle').click({ timeout });
    await handleCard
      .getByLabel('Edit Proposed Handle')
      .fill(handle, { timeout });
    await handleCard
      .getByTestId('onboarding-confirm-handle')
      .click({ timeout });
    await snap('handle confirmed');

    const field = page.getByRole('textbox', { name: /^email/i }).last();
    await field.fill(email, { timeout });
    const signedUpAt = Date.now();
    await page
      .getByRole('button', { name: /send sign-in code/i })
      .last()
      .click({ timeout });
    const code = await otp(signedUpAt);
    const codeInput = page.getByTestId('otp-autofill-input').first();
    await codeInput.waitFor({ timeout });
    await snap('signup otp step');
    const [claim] = await Promise.all([
      page.waitForResponse(
        response => {
          const url = new URL(response.url());
          return (
            url.origin === origin &&
            url.pathname === '/api/onboarding/claim' &&
            response.request().method() === 'POST'
          );
        },
        { timeout }
      ),
      codeInput.fill(code, { timeout }),
    ]);
    assert.ok(!waitlistVisited, 'Walk visited /waitlist');
    assert.ok(claim.ok(), `Onboarding claim returned HTTP ${claim.status()}`);
    const result = await claim.json();
    assert.ok(
      !result.waitlist && !result.waitlistIntakeRequired,
      'Claim hit a waitlist wall'
    );
    assert.ok(
      !result.proofPending,
      'Claim requires operator proof before publication'
    );
    assert.equal(
      result.profile?.handle,
      handle,
      'Claim did not keep the chosen handle'
    );
    assert.ok(result.profile?.profileId, 'Claim did not materialize a profile');
    await snap('signed in and onboarding claimed');

    const profilePath = `/${handle}`;
    const response = await page.goto(`${origin}${profilePath}?mode=listen`, {
      waitUntil: 'domcontentloaded',
      timeout,
    });
    assert.equal(
      response?.status(),
      200,
      'Public profile did not return HTTP 200'
    );
    assert.equal(
      new URL(page.url()).pathname,
      profilePath,
      'Profile redirected'
    );
    await page
      .getByRole('heading', { level: 1, name: ARTIST, exact: true })
      .waitFor({ timeout });
    await page
      .locator(`a[href^="${profilePath}/"]:visible`)
      .first()
      .waitFor({ timeout });
    assert.ok(!waitlistVisited, 'Walk visited /waitlist');
    await snap('profile live', {
      receiptReached: true,
      receiptMs: Date.now() - signedUpAt,
    });
  } catch (error) {
    if (waitlistVisited)
      throw new Error('Walk visited /waitlist', { cause: error });
    throw error;
  } finally {
    page.off('request', onRequest);
    page.off('framenavigated', onNavigation);
  }
}
