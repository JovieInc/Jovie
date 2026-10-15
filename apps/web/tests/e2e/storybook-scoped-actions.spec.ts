import { expect, test } from '@playwright/test';

// Browser/component evidence. API responses below are fixtures, not auth or deployment proof.
test.describe('scoped action input', () => {
  test.describe.configure({ retries: 0, timeout: 240_000 });

  test('Jovie menu and keyboard share Work while composer input retains its draft', async ({
    page,
  }, testInfo) => {
    const path =
      '/iframe.html?id=hooks-sequential-shortcuts--scoped-navigation&viewMode=story';
    await page.goto(path, { waitUntil: 'commit' });
    const target = page.getByRole('status', { name: 'Navigation target' });
    await expect(target).toHaveText('No navigation', { timeout: 180_000 });
    const editor = page.getByRole('textbox', { name: 'Unsent notes' });
    const editorBox = await editor.boundingBox();
    await editor.focus();
    await editor.press('End');
    await editor.press('g');
    await editor.press('r');
    await expect(editor).toHaveValue('Unsent release notesgr');
    await expect(editor).toBeFocused();
    expect(await editor.boundingBox()).toEqual(editorBox);
    await expect(target).toHaveText('No navigation');
    await page.locator('main').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('g');
    await page.keyboard.press('r');
    const href = await target.textContent();
    expect(href).toBe('/app/library');
    await page.reload({ waitUntil: 'commit' });
    await expect(target).toHaveText('No navigation', { timeout: 180_000 });
    await page.getByRole('option').click();
    await expect(target).toHaveText(href ?? 'missing');
    await testInfo.attach('jovie-scoped-navigation.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('Ovie review arrows yield to IME and pending work, and pointer uses the same decision target', async ({
    page,
  }, testInfo) => {
    // Use the preview's existing per-story API adapter; its API fence runs
    // before network routing and deliberately rejects unconfigured requests.
    await page.addInitScript(() => {
      const decisions: Array<{ target: { id: string }; decision: string }> = [];
      Reflect.set(globalThis, '__scopedActionDecisions', decisions);
      Reflect.set(
        globalThis,
        '__jovieApiMock',
        ({ url, init }: { url: URL; init?: RequestInit }) => {
          if (!url.pathname.startsWith('/api/inbox/founder-reviews'))
            return undefined;
          if (!init?.method || init.method === 'GET')
            return Response.json({ ok: true, receipts: [] });
          const body = JSON.parse(String(init.body));
          if (init.method === 'POST') decisions.push(body);
          return Response.json({
            ok: true,
            receipt: {
              id: 'receipt-browser',
              target: body.target ?? { id: 'opportunity-1' },
              decision: body.decision ?? 'approved',
              recording: { mediaAvailable: false },
              actionOutcome: {
                status: 'applied',
                updatedAt: '2026-10-15T00:00:00.000Z',
                errorCode: null,
              },
            },
          });
        }
      );
    });
    const readDecisions = () =>
      page.evaluate(
        () =>
          Reflect.get(globalThis, '__scopedActionDecisions') as Array<{
            target: { id: string };
            decision: string;
          }>
      );
    const base =
      '/iframe.html?id=dashboard-opportunity-inbox-founder-review-stack--';
    await page.goto(`${base}no-visual&viewMode=story`, { waitUntil: 'commit' });
    const control = page.getByRole('button', {
      name: 'Review Current Opportunity',
    });
    await expect(control).toBeAttached({ timeout: 180_000 });
    await control.focus();
    expect(
      await control.evaluate(element =>
        element.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            isComposing: true,
            bubbles: true,
            cancelable: true,
          })
        )
      )
    ).toBe(true);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => (await readDecisions()).length).toBe(1);
    expect((await readDecisions())[0]).toMatchObject({
      target: { id: 'opportunity-1' },
      decision: 'approved',
    });
    await page.reload({ waitUntil: 'commit' });
    await expect(control).toBeAttached({ timeout: 180_000 });
    await control.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await readDecisions()).length).toBe(1);
    expect((await readDecisions())[0]).toMatchObject({
      target: { id: 'opportunity-1' },
      decision: 'rejected',
    });
    await page.goto(`${base}pending-approval&viewMode=story`, {
      waitUntil: 'commit',
    });
    await expect(control).toBeDisabled({ timeout: 180_000 });
    await control.dispatchEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    });
    expect(await readDecisions()).toHaveLength(0);
    await testInfo.attach('ovie-pending-review.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
});
