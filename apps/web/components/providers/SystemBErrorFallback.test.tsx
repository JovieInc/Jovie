import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SystemBErrorFallback } from './SystemBErrorFallback';

describe('SystemBErrorFallback', () => {
  it('runs the retry action once and keeps the digest behind a closed disclosure', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { container } = render(
      <SystemBErrorFallback
        description='Try again in a moment.'
        digest='dashboard-timeout'
        action={{ type: 'button', label: 'Try again', onClick }}
        role='alert'
        ariaLive='assertive'
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Something went wrong' })
    ).toBeInTheDocument();
    expect(screen.getByText('Try again in a moment.')).toBeInTheDocument();

    const details = screen
      .getByText('Error ID: dashboard-timeout')
      .closest('details');
    expect(details).not.toHaveAttribute('open');
    await user.click(screen.getByText('Error details'));
    expect(details).toHaveAttribute('open');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders a link action with its href and no disclosure when there is no digest', async () => {
    const { container } = render(
      <SystemBErrorFallback
        title='Page moved'
        description='This page moved. Head back home.'
        action={{
          type: 'link',
          label: 'Go home',
          href: '/',
          variant: 'secondary',
        }}
        ariaLive='polite'
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Page moved' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('details')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to a generic label when a button action has none', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <SystemBErrorFallback
        description='Try again.'
        action={{ type: 'button', label: '', onClick }}
        className='min-h-screen'
      />
    );

    expect(container.firstElementChild).toHaveClass(
      'dark',
      'system-b-error-fallback',
      'min-h-screen'
    );
    await user.click(screen.getByRole('button', { name: 'Action' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left copy readable and axe-clean', async () => {
    const longTitle =
      'Something went wrong while loading this workspace and every one of its releases';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SystemBErrorFallback
          title={longTitle}
          description='حاول مرة أخرى بعد قليل.'
          digest='dashboard-timeout-3f9c2a7b1e4d8c6a0b5f2e9d7c1a3b8e4f6d2c9a'
          action={{
            type: 'button',
            label: 'حاول مرة أخرى',
            onClick: () => undefined,
          }}
          role='alert'
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { name: longTitle })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'حاول مرة أخرى' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
