import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';

const PREFIX = 'dashboard-opportunity-inbox-page-client--';
const states = [
  {
    absent: 'empty',
    due: 'empty-with-survey',
    primary: 'opportunity-inbox-empty-state',
  },
  {
    absent: 'with-cards',
    due: 'with-cards-and-survey',
    primary: 'opportunity-inbox-signal-filters',
  },
  {
    absent: 'unavailable',
    due: 'unavailable-with-survey',
    primary: 'opportunity-inbox-availability',
  },
] as const;

for (const viewport of [
  { width: 1512, height: 982 },
  { width: 390, height: 844 },
]) {
  for (const state of states) {
    test(`${state.due} preserves primary work at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(() =>
        localStorage.setItem('jovie-theme-storybook', 'dark')
      );
      await page.goto(
        `/iframe.html?id=${PREFIX}${state.absent}&viewMode=story`
      );
      const primary = page.getByTestId(state.primary);
      await expect(primary).toBeVisible();
      const absentBounds = await primary.boundingBox();
      await expect(page.getByTestId('pmf-survey-card')).toHaveCount(0);

      await page.goto(`/iframe.html?id=${PREFIX}${state.due}&viewMode=story`);
      const survey = page.getByTestId('pmf-survey-card');
      await expect(survey).toBeVisible();
      await expect(primary).toBeVisible();
      expect(await primary.boundingBox()).toEqual(absentBounds);
      const collapsedBounds = await survey.boundingBox();
      expect(collapsedBounds!.y).toBeGreaterThanOrEqual(
        absentBounds!.y + absentBounds!.height
      );
      expect(collapsedBounds!.y + collapsedBounds!.height).toBeLessThanOrEqual(
        viewport.height
      );
      await expect(survey.getByRole('radio')).toHaveCount(0);
      await testInfo.attach('compact.png', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });

      const answer = survey.getByRole('button', {
        name: /^(Answer|Hide)$/,
      });
      await answer.focus();
      await page.keyboard.press('Enter');
      await expect(answer).toHaveAttribute('aria-expanded', 'true');
      await expect(answer).toBeFocused();
      expect(await primary.boundingBox()).toEqual(absentBounds);
      await page.keyboard.press('Tab');
      await expect(
        survey.getByRole('button', { name: 'Dismiss' })
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(
        survey.getByRole('radio', { name: 'Very Disappointed' })
      ).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(
        survey.getByRole('radio', { name: 'Somewhat Disappointed' })
      ).toBeChecked();
      await page.keyboard.press('Tab');
      const benefit = survey.getByLabel(/main benefit/);
      await expect(benefit).toBeFocused();
      await benefit.fill('Release planning');
      await survey.getByRole('button', { name: 'Send answer' }).click();
      // Synthetic story callback fails locally. No server action or real survey runs.
      await expect(survey.getByRole('alert')).toHaveText(
        'Your answer was not saved. Try again.'
      );
      await expect(benefit).toHaveValue('Release planning');
      await expect(
        survey.getByRole('radio', { name: 'Somewhat Disappointed' })
      ).toBeChecked();
      await testInfo.attach('expanded-error.png', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
      await survey.getByRole('button', { name: 'Hide', exact: true }).click();
      await expect(
        survey.getByRole('button', { name: 'Answer', exact: true })
      ).toBeFocused();
      await page.keyboard.press('Space');
      await expect(benefit).toHaveValue('Release planning');
      await expect(survey.getByRole('alert')).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
    });
  }
}

test('light-theme survey errors remain readable and announced', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem('jovie-theme-storybook', 'light')
  );
  await page.goto(`/iframe.html?id=${PREFIX}empty-with-survey&viewMode=story`);
  const survey = page.getByTestId('pmf-survey-card');
  await survey.getByRole('button', { name: 'Answer', exact: true }).click();
  await survey.getByRole('radio', { name: 'Very Disappointed' }).click();
  await survey.getByRole('button', { name: 'Send answer' }).click();
  await expect(survey.getByRole('alert')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[data-testid="pmf-survey-card"]')
    .options(wcag22AaAxeOptions())
    .analyze();
  expect(results.violations).toEqual([]);
});
