import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { makeScreenshot } from './ScreenshotGallery.fixtures';
import { ScreenshotLightbox } from './ScreenshotLightbox';

function renderLightbox(
  overrides: Partial<Parameters<typeof ScreenshotLightbox>[0]> = {}
) {
  const handlers = {
    onClose: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
  };
  const view = render(
    <ScreenshotLightbox
      open
      selected={makeScreenshot()}
      index={1}
      count={3}
      {...handlers}
      {...overrides}
    />
  );
  return { ...view, ...handlers };
}

describe('ScreenshotLightbox', () => {
  it('steps between captures and shows the position', async () => {
    const user = userEvent.setup();
    const { onPrevious, onNext } = renderLightbox();

    expect(screen.getByText('2/3')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Previous Screenshot' })
    );
    await user.click(screen.getByRole('button', { name: 'Next Screenshot' }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(document.body);
  });

  it('disables previous on the first and next on the last capture', () => {
    const { rerender, onClose, onNext, onPrevious } = renderLightbox({
      index: 0,
    });
    expect(
      screen.getByRole('button', { name: 'Previous Screenshot' })
    ).toBeDisabled();

    rerender(
      <ScreenshotLightbox
        open
        selected={makeScreenshot()}
        index={2}
        count={3}
        onClose={onClose}
        onPrevious={onPrevious}
        onNext={onNext}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Next Screenshot' })
    ).toBeDisabled();
  });

  it('shows the export link, commit and download for the selection', () => {
    renderLightbox();

    expect(screen.getByRole('link', { name: 'Public Export' })).toHaveAttribute(
      'href',
      'https://example.com/home-desktop.png'
    );
    expect(screen.getByText('abcdef12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download/ })).toHaveAttribute(
      'download',
      'home-desktop.png'
    );
  });

  it('falls back to a generic title with nothing selected', () => {
    renderLightbox({ selected: null, index: null, count: 0 });

    expect(screen.getByText('Screenshot')).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });
});
