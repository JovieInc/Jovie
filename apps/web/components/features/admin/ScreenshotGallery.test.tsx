import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ScreenshotGallery } from './ScreenshotGallery';
import { SCREENSHOT_SET } from './ScreenshotGallery.fixtures';

describe('ScreenshotGallery', () => {
  it('shows every capture with its counts and stays axe-clean', async () => {
    const { container } = render(
      <ScreenshotGallery screenshots={SCREENSHOT_SET} />
    );

    expect(
      screen.getByText(/Showing 3 of 3 captures. Canonical: 2. Other: 1./)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View Homepage Mobile' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('filters by surface and reports an empty match', async () => {
    const user = userEvent.setup();
    render(<ScreenshotGallery screenshots={SCREENSHOT_SET} />);

    await user.click(screen.getByRole('button', { name: 'Other Captures' }));
    expect(screen.getByText(/Showing 1 of 3 captures/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View Settings Desktop' })
    ).toBeInTheDocument();

    await user.click(screen.getByText('More Filters'));
    await user.click(screen.getByRole('button', { name: 'Investor Ready' }));
    expect(
      screen.getByText('No screenshots match the current filters.')
    ).toBeInTheDocument();
  });

  it('renders the empty state with no captures', async () => {
    const { container } = render(<ScreenshotGallery screenshots={[]} />);

    expect(
      screen.getByText('No screenshots match the current filters.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens the lightbox and steps with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<ScreenshotGallery screenshots={SCREENSHOT_SET} />);

    await user.click(
      screen.getByRole('button', { name: 'View Homepage Desktop' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('1/3')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('2/3')).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(within(dialog).getByText('1/3')).toBeInTheDocument();
  });

  it('draws the selected filter with the accent token, not a linear variable', async () => {
    render(<ScreenshotGallery screenshots={SCREENSHOT_SET} />);

    const pill = screen.getByRole('button', { name: 'All Captures' });
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    expect(pill.className).toContain('bg-accent/10');
    expect(pill.className).not.toContain('--linear');
  });
});
