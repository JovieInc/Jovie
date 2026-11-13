import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AvatarProgressRing } from './AvatarProgressRing';

const CIRCUMFERENCE = 2 * Math.PI * 48.5;

function progressCircle(container: HTMLElement) {
  return container.querySelectorAll('circle')[1];
}

describe('AvatarProgressRing', () => {
  it('draws the uploading sweep from progress and stays decorative', async () => {
    const { container } = render(
      <div className='relative'>
        <AvatarProgressRing progress={45} size={96} status='uploading' />
      </div>
    );

    const ring = screen.getByTestId('avatar-uploadable-progress');
    expect(ring).toHaveAttribute('aria-hidden', 'true');
    expect(progressCircle(container)).toHaveAttribute(
      'stroke-dasharray',
      `${0.45 * CIRCUMFERENCE} ${CIRCUMFERENCE}`
    );
    expect(progressCircle(container)).toHaveClass('text-accent');
    expect(container.querySelector('svg')).toHaveAttribute('width', '96');
    await expectNoA11yViolations(container);
  });

  it.each([
    ['success', 'text-success'],
    ['error', 'text-destructive'],
    ['idle', 'text-secondary-token'],
  ] as const)(
    'colors the %s ring with its status token',
    async (status, token) => {
      const { container } = render(
        <div className='relative'>
          <AvatarProgressRing progress={60} size={64} status={status} />
        </div>
      );

      expect(progressCircle(container)).toHaveClass(token);
      // Idle shows no status badge; the others show one icon badge.
      expect(container.querySelectorAll('.rounded-full')).toHaveLength(
        status === 'idle' ? 0 : 1
      );
      await expectNoA11yViolations(container);
    }
  );

  it('draws an empty ring at zero progress', async () => {
    const { container } = render(
      <div className='relative'>
        <AvatarProgressRing progress={0} size={96} status='idle' />
      </div>
    );

    expect(progressCircle(container)).toHaveAttribute(
      'stroke-dasharray',
      `0 ${CIRCUMFERENCE}`
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the same sweep in a right-to-left layout', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar' className='relative'>
        <AvatarProgressRing progress={70} size={96} status='uploading' />
      </div>
    );

    expect(container.querySelector('svg')).toHaveClass('-rotate-90');
    expect(progressCircle(container)).toHaveAttribute(
      'stroke-dasharray',
      `${0.7 * CIRCUMFERENCE} ${CIRCUMFERENCE}`
    );
    await expectNoA11yViolations(container);
  });
});
