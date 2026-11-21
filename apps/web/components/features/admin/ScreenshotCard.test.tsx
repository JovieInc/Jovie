import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ScreenshotCard } from './ScreenshotCard';
import { makeScreenshot } from './ScreenshotGallery.fixtures';

describe('ScreenshotCard', () => {
  it('opens the capture from the preview and links the download', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { container } = render(
      <ScreenshotCard screenshot={makeScreenshot()} onOpen={onOpen} />
    );

    await user.click(
      screen.getByRole('link', { name: 'View Homepage Desktop' })
    );

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('link', { name: 'Download Homepage Desktop' })
    ).toHaveAttribute('download', 'home-desktop.png');
    expect(
      screen.getByRole('img', { name: 'Homepage Desktop' })
    ).toHaveAttribute('width', '640');
    await expectNoA11yViolations(container);
  });

  it('hides admin as a use case and shows the others', () => {
    render(
      <ScreenshotCard
        screenshot={makeScreenshot({ consumers: ['admin', 'investor-ready'] })}
        onOpen={vi.fn()}
      />
    );

    expect(screen.getByText('Investor Ready')).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
  });

  it('shows Unknown for an unparseable capture date', async () => {
    const { container } = render(
      <ScreenshotCard
        screenshot={makeScreenshot({ capturedAt: 'not a date' })}
        onOpen={vi.fn()}
      />
    );

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
