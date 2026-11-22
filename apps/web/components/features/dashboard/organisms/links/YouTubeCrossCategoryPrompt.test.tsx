import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { YouTubeCrossCategoryPrompt } from './YouTubeCrossCategoryPrompt';

const candidate: DetectedLink = {
  platform: {
    id: 'youtube',
    name: 'YouTube',
    category: 'social',
    icon: 'youtube',
    color: 'FF0000',
    placeholder: 'https://youtube.com/@artist',
  },
  normalizedUrl: 'https://youtube.com/@artist',
  originalUrl: 'https://youtube.com/@artist',
  suggestedTitle: 'YouTube',
  isValid: true,
};

describe('YouTubeCrossCategoryPrompt', () => {
  it('confirms with the candidate and target, or cancels', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <YouTubeCrossCategoryPrompt
        candidate={candidate}
        target='dsp'
        onConfirm={onConfirm}
        onCancel={onCancel}
        animate={false}
      />
    );

    expect(screen.getByText(/add it as a music service/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Add as/ }));
    expect(onConfirm).toHaveBeenCalledWith(candidate, 'dsp');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('is a labelled region, not a modal dialog', () => {
    const { container } = render(
      <YouTubeCrossCategoryPrompt
        candidate={candidate}
        target='social'
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        animate={false}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelector('dialog')).toBeNull();
    expect(
      screen.getByRole('region', { name: /You already added YouTube/ })
    ).toHaveAttribute('data-testid', 'youtube-cross-category-prompt');
  });

  it('renders nothing without a candidate', () => {
    const { container } = render(
      <YouTubeCrossCategoryPrompt
        candidate={null}
        target='dsp'
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('fades in on mount when animated', async () => {
    const { container } = render(
      <YouTubeCrossCategoryPrompt
        candidate={candidate}
        target='dsp'
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await vi.waitFor(() =>
      expect(container.firstElementChild).toHaveStyle({ opacity: '1' })
    );
    await expectNoA11yViolations(container);
  });
});
