import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ScreenshotGallery } from './ScreenshotGallery';
import {
  screenshotFixture,
  screenshotFixtureSet,
} from './screenshot-gallery-fixtures';

describe('ScreenshotGallery', () => {
  it('groups captures, sizes every image and stays axe-clean', async () => {
    const { container } = render(
      <ScreenshotGallery screenshots={screenshotFixtureSet()} />
    );
    expect(screen.getByText(/Showing 3 of 3 captures/)).toBeVisible();
    expect(screen.getByText('Canonical Surfaces')).toBeVisible();
    expect(
      screen.getByText('Other Captures', { selector: 'h2' })
    ).toBeVisible();
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveAttribute('width');
      expect(image).toHaveAttribute('height');
    }
    await expectNoA11yViolations(container);
  });

  it('filters by surface and reports the pressed state', async () => {
    const user = userEvent.setup();
    render(<ScreenshotGallery screenshots={screenshotFixtureSet()} />);
    const chip = screen.getByRole('button', { name: 'Other Captures' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Showing 1 of 3 captures/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'View Homepage Desktop' })
    ).not.toBeInTheDocument();
  });

  it('shows the empty message when no capture matches the filters', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ScreenshotGallery screenshots={[screenshotFixture()]} />
    );
    await user.click(screen.getByRole('button', { name: 'Other Captures' }));
    expect(
      screen.getByText('No screenshots match the current filters.')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('opens the lightbox, steps with the arrow keys and closes', async () => {
    const user = userEvent.setup();
    render(<ScreenshotGallery screenshots={screenshotFixtureSet()} />);
    await user.click(
      screen.getByRole('button', { name: 'View Homepage Desktop' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('1/3')).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Previous Screenshot' })
    ).toBeDisabled();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('2/3')).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: 'Next Screenshot' })
    );
    expect(within(dialog).getByText('3/3')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders right-to-left titles axe-clean', async () => {
    const { container } = render(
      <ScreenshotGallery
        screenshots={[screenshotFixture({ title: 'الصفحة الرئيسية' })]}
      />
    );
    expect(
      screen.getByRole('button', { name: 'View الصفحة الرئيسية' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
