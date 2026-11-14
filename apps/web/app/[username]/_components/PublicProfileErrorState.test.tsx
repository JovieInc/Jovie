import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicProfileErrorState } from './PublicProfileErrorState';

describe('PublicProfileErrorState', () => {
  it('announces the read failure as an assertive alert named by its heading', async () => {
    const { container } = render(<PublicProfileErrorState retryHref='/tim' />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAccessibleName('Profile Is Temporarily Unavailable');
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Profile Is Temporarily Unavailable',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(alert);
    await expectNoA11yViolations(container);
  });

  it('retries the same profile and offers a way home', () => {
    render(<PublicProfileErrorState retryHref='/tim?retry=1' />);

    expect(screen.getByRole('link', { name: 'Try Again' })).toHaveAttribute(
      'href',
      '/tim?retry=1'
    );
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('draws Try Again as the fixed white pill with black ink in both themes', () => {
    render(<PublicProfileErrorState retryHref='/tim' />);

    // on-media is #ffffff and ink-on-media #000000 in light and dark, the
    // values the retired bg-white / text-black classes drew.
    expect(screen.getByRole('link', { name: 'Try Again' })).toHaveClass(
      'bg-on-media',
      'text-ink-on-media',
      'hover:bg-on-media/90',
      'focus-visible:ring-on-media'
    );
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveClass(
      'focus-visible:ring-on-media'
    );
  });

  it('moves keyboard focus from Try Again to Go Home', async () => {
    const user = userEvent.setup();
    render(<PublicProfileErrorState retryHref='/tim' />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Try Again' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveFocus();
  });

  it('keeps the warning icon out of the accessibility tree', () => {
    const { container } = render(<PublicProfileErrorState retryHref='/tim' />);

    expect(container.querySelector('svg')?.parentElement).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('stays axe-clean at phone width', async () => {
    const { container } = render(
      <div className='w-80'>
        <PublicProfileErrorState retryHref='/tim' />
      </div>
    );

    expect(
      screen.getByRole('link', { name: 'Try Again' }).parentElement
    ).toHaveClass('flex-col', 'sm:flex-row');
    await expectNoA11yViolations(container);
  });

  it('keeps the same reading order in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <PublicProfileErrorState retryHref='/tim' />
      </div>
    );

    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      'Try Again',
      'Go Home',
    ]);
    await expectNoA11yViolations(container);
  });
});
