import { expect, test } from '@playwright/test';

// Component interaction proof, without auth, DB, music enrichment, or model calls.
// The unchanged real-auth Golden Path remains JOV-7192's acceptance gate.
const cases = [
  {
    name: 'desktop',
    width: 1280,
    theme: 'dark',
    reducedMotion: 'no-preference',
  },
  { name: 'tablet', width: 1024, theme: 'dark', reducedMotion: 'reduce' },
  { name: 'mobile', width: 390, theme: 'dark', reducedMotion: 'reduce' },
  {
    name: 'desktop light',
    width: 1280,
    theme: 'light',
    reducedMotion: 'reduce',
  },
] as const;

for (const scenario of cases) {
  test(`artist confirmation keeps the handle turn reachable: ${scenario.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 720 });
    await page.emulateMedia({ reducedMotion: scenario.reducedMotion });
    await page.goto(
      '/iframe.html?id=features-onboarding-chatrecovery--second-turn&viewMode=story'
    );
    const input = page.getByRole('textbox', { name: 'Chat Message Input' });
    const send = page.getByRole('button', {
      name: 'Send message',
      exact: true,
    });
    await input.waitFor();
    await page.evaluate(theme => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.dataset.theme = theme;
    }, scenario.theme);

    await input.fill('https://open.spotify.com/artist/1ZlSI1juLMMN1HU8X7RViN');
    await send.click();
    await expect(page.getByTestId('submitted-turn-count')).toHaveText('1');
    await expect(
      page.getByTestId(
        scenario.width >= 1024
          ? 'onboarding-profile-rail'
          : 'onboarding-profile-rail-inline'
      )
    ).toBeVisible();
    await input.fill('Set my profile handle');
    await expect(send).toBeEnabled();
    await send.scrollIntoViewIfNeeded();

    // A synthetic DOM click misses the regression: the preview intercepted
    // the physical pointer even though the Send control was enabled.
    const receivesPointer = await send.evaluate(button => {
      const rect = button.getBoundingClientRect();
      return button.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2
        )
      );
    });
    expect(receivesPointer).toBe(true);
    await send.click();
    await expect(page.getByTestId('submitted-turn-count')).toHaveText('2');
    await expect(
      page.getByRole('textbox', { name: 'Proposed handle' })
    ).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(
      page.getByRole('link', { name: 'Sign in', exact: true })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}

for (const scenario of cases) {
  test(`identity conflict preserves controls, intent, and composer: ${scenario.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 720 });
    await page.emulateMedia({ reducedMotion: scenario.reducedMotion });
    await page.goto(
      '/iframe.html?id=features-onboarding-chatrecovery--identity-conflict&viewMode=story'
    );
    const toggle = page.getByRole('button', { name: 'Toggle Conflict' });
    await toggle.waitFor();
    await page.evaluate(theme => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.dataset.theme = theme;
    }, scenario.theme);
    const nav = page.getByTestId('onboarding-sign-in-header');
    const slot = page.getByTestId('onboarding-identity-recovery-slot');
    const transcript = page.getByTestId('recovery-transcript');
    const input = page.getByRole('textbox', { name: 'Chat message' });
    await input.fill('Keep this intent');
    const before = {
      nav: await nav.boundingBox(),
      slot: await slot.boundingBox(),
      transcript: await transcript.boundingBox(),
      input: await input.boundingBox(),
    };
    await toggle.click();
    await expect(page.getByRole('alert')).toContainText(
      'verified profile claim flow'
    );
    const disclosure = page.getByRole('button', { name: 'Profile Conflict' });
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(await nav.boundingBox()).toEqual(before.nav);
    expect(await transcript.boundingBox()).toEqual(before.transcript);
    expect(await input.boundingBox()).toEqual(before.input);
    await disclosure.click();
    const recovery = page.getByRole('button', { name: 'Switch Account' });
    await expect(recovery).toBeVisible();
    const after = {
      nav: await nav.boundingBox(),
      slot: await slot.boundingBox(),
      transcript: await transcript.boundingBox(),
      input: await input.boundingBox(),
    };
    expect(after.nav).toEqual(before.nav);
    const panel = await page
      .getByTestId('onboarding-identity-conflict')
      .boundingBox();
    expect(after.transcript!.y - before.transcript!.y).toBeCloseTo(
      panel!.height
    );
    expect(after.input).toEqual(before.input);
    const alert = await page
      .getByTestId('onboarding-identity-conflict')
      .getByText(/This artist/)
      .boundingBox();
    expect(alert!.y).toBeGreaterThanOrEqual(after.nav!.y + after.nav!.height);
    expect(alert!.y + alert!.height).toBeLessThanOrEqual(after.transcript!.y);
    for (const control of [
      page.getByRole('button', { name: 'Log Out' }),
      recovery,
      input,
    ]) {
      expect(
        await control.evaluate(element => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2
            )
          );
        })
      ).toBe(true);
    }
    await recovery.click();
    await expect(page.getByTestId('recovery-switch-count')).toHaveText('1');
    await recovery.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('recovery-switch-count')).toHaveText('2');
    await expect(input).toHaveValue('Keep this intent');
    await expect(transcript).toContainText(
      'I want a profile that converts fans'
    );
    await page.screenshot({
      path: `${test.info().outputDir}/identity-conflict.png`,
    });
    await toggle.click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await transcript.boundingBox()).toEqual(before.transcript);
    expect(await input.boundingBox()).toEqual(before.input);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}
