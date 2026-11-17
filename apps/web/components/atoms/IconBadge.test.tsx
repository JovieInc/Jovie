import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { IconBadge } from './IconBadge';

describe('IconBadge', () => {
  it('exposes a labelled badge as one named image', async () => {
    const { container } = render(
      <IconBadge
        name='Bell'
        colorVar='--color-warning'
        ariaLabel='Notification'
      />
    );

    const icon = screen.getByRole('img', { name: 'Notification' });
    expect(icon).not.toHaveAttribute('aria-hidden', 'true');
    expect(icon.style.color).toBe('var(--color-warning)');
    const frame = container.querySelector('[data-icon-glyph]') as HTMLElement;
    expect(frame).toHaveClass('relative', 'h-8', 'w-8');
    expect(frame.style.getPropertyValue('--icon-glyph-hover-surface')).toBe(
      'color-mix(in srgb, var(--color-warning) 12%, transparent)'
    );
    await expectNoA11yViolations(container);
  });

  it('hides a partial, unlabelled glyph beside its own text', async () => {
    const { container } = render(
      <div>
        <IconBadge name='Music' colorVar='--color-accent' className='mr-2' />
        <span>Music</span>
      </div>
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[data-icon-glyph]')).toHaveClass('mr-2');
    await expectNoA11yViolations(container);
  });

  it('keeps a long label and an Arabic label on the image', async () => {
    const longLabel =
      'Three new notifications about release links, playlist pitches and fan messages';
    const { container, unmount } = render(
      <IconBadge name='Bell' colorVar='--color-warning' ariaLabel={longLabel} />
    );
    expect(screen.getByRole('img', { name: longLabel })).toBeInTheDocument();
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <IconBadge name='Bell' colorVar='--color-warning' ariaLabel='إشعار' />
      </div>
    );
    expect(screen.getByRole('img', { name: 'إشعار' })).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
