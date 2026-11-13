import { expect, test } from '@playwright/test';

const blocked = [
  ['needs-review', 'Current facts need certification', 'Refresh Evidence'],
  ['needs-judge', 'dogfood judge', 'Review Profile'],
  [
    'cold-draft-unavailable',
    'email compliance checks are missing',
    'Review Profile',
  ],
  ['no-profile', 'No Jovie profile has been built', 'Review Source'],
  ['no-reachability', 'No reachable channel', 'Review Source'],
  ['stale-facts', 'Certification is stale', 'Refresh Evidence'],
  ['rejected', 'Rejected: Wrong person', 'Review Facts'],
  ['held', 'on hold', 'Review Facts'],
  ['loading-facts', 'Current facts are loading', 'Review Source'],
  ['decision-failed', 'Approval refused: facts changed', 'Review Message'],
] as const;

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  for (const [story, reason, next] of blocked) {
    test(`${story} decision fits without scrolling at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/iframe.html?id=admin-outbound-rail--${story}&viewMode=story`,
        { waitUntil: 'domcontentloaded' }
      );
      // Storybook compiles this large rail on first load; wait for the fixture,
      // then keep the normal assertion deadlines for behavior and geometry.
      await page.getByTestId('outbound-rail').waitFor({ timeout: 90_000 });
      const summary = page.getByTestId('outbound-readiness');
      await expect(summary).toContainText(reason);
      await expect(summary).toContainText('Sending remains closed');
      const action = page
        .getByTestId('outbound-next-action')
        .getByText(next, { exact: true });
      await expect(action).toBeVisible();
      const bounds = await summary.boundingBox();
      const actionBounds = await action.boundingBox();
      const footer = await page
        .getByRole('button', { name: 'Hold', exact: true })
        .boundingBox();
      expect(bounds).not.toBeNull();
      expect(actionBounds).not.toBeNull();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThan(footer!.y);
      expect(actionBounds!.x).toBeGreaterThanOrEqual(0);
      expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(
        viewport.width
      );
      expect(actionBounds!.height).toBeLessThanOrEqual(28);
      expect(
        await summary
          .locator('li')
          .first()
          .evaluate(element => getComputedStyle(element).fontSize)
      ).toBe('12px');
      expect(
        await page
          .getByTestId('outbound-rail')
          .locator('[data-scroll-strategy="shell"]')
          .evaluate(element => element.scrollTop)
      ).toBe(0);
      const approve = page.getByRole('button', {
        name: 'Approve',
        exact: true,
      });
      if (story !== 'decision-failed' && (await approve.count()))
        await expect(approve).toBeDisabled();
      await page.screenshot({
        path: testInfo.outputPath(`${story}-${viewport.width}.png`),
      });
    });
  }
}

test('fact provenance and correction are keyboard accessible without implicit writes', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=admin-outbound-rail--long-name-evidence&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  await page.getByTestId('outbound-rail').waitFor({ timeout: 90_000 });
  await expect(
    page.getByText('Suggested display: Ada and the Midnight Orchestra')
  ).toBeVisible();
  const group = page.getByRole('group', { name: 'Review Display name' });
  const yes = group.getByRole('button', { name: 'Yes', exact: true });
  await yes.focus();
  await page.keyboard.press('Tab');
  await expect(
    group.getByRole('button', { name: 'No', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    group.getByRole('button', { name: 'Unsure', exact: true })
  ).toBeFocused();
  const disclosure = page.getByRole('button', {
    name: 'Source and review details: Display name',
  });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Correct Display name')).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Save Correction' })
  ).toBeDisabled();
  await expect(
    page.getByText(
      'Recorded decision: Not reviewed. Evidence revision: evidence-revision-1',
      { exact: true }
    )
  ).toBeVisible();
});

test('rapid person navigation resets draft edits, corrections and disclosures', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=admin-outbound-rail--rapid-person-navigation&viewMode=story',
    { waitUntil: 'domcontentloaded' }
  );
  await page.getByTestId('outbound-rail').waitFor({ timeout: 90_000 });
  await page.getByLabel('Message Body').fill('Unsaved Ada edit');
  const disclosure = page.getByRole('button', {
    name: 'Source and review details: Display name',
  });
  await disclosure.click();
  await page.getByLabel('Correct Display name').fill('Unsaved correction');
  await page.getByRole('button', { name: 'Next Person' }).dblclick();
  await expect(page.getByLabel('Message Body')).toHaveValue('Cy draft');
  await expect(
    page.getByRole('button', { name: 'Certification details' })
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.click();
  await expect(page.getByLabel('Correct Display name')).toHaveValue('');
  await expect(
    page.getByText('Cy | Instagram, Spotify', { exact: true })
  ).toBeVisible();
});
