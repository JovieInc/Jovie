import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StudioCameraBlocked } from './StudioCameraBlocked';

describe('StudioCameraBlocked', () => {
  it('explains a denied camera and offers a retry', () => {
    const onRetry = vi.fn();
    render(
      <StudioCameraBlocked error='denied' onRetry={onRetry} onClose={vi.fn()} />
    );

    expect(
      screen.getByText('Jovie needs your camera and mic')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('offers only the way back when there is no camera', () => {
    const onClose = vi.fn();
    render(
      <StudioCameraBlocked
        error='no-device'
        onRetry={vi.fn()}
        onClose={onClose}
      />
    );

    expect(screen.queryByText('Try Again')).toBeNull();
    fireEvent.click(screen.getByText('Back To Chat'));
    expect(onClose).toHaveBeenCalled();
  });

  it('passes axe for every camera error', async () => {
    for (const error of [
      'denied',
      'no-device',
      'in-use',
      'unsupported',
      'unknown',
    ] as const) {
      const { container, unmount } = render(
        <StudioCameraBlocked
          error={error}
          onRetry={vi.fn()}
          onClose={vi.fn()}
        />
      );
      await expectNoA11yViolations(container);
      unmount();
    }
  });
});
