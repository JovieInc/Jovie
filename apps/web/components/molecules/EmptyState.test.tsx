import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('names the status region by its heading and describes it by its sentence', async () => {
    const { container } = render(
      <EmptyState
        icon={<Inbox className='h-5 w-5' />}
        heading='No Releases Yet'
        description='Connect Spotify to import your catalog.'
      />
    );

    const region = screen.getByRole('status', { name: 'No Releases Yet' });
    expect(region).toHaveAccessibleDescription(
      'Connect Spotify to import your catalog.'
    );
    expect(region).toHaveAttribute('data-content-state', 'empty');
    expect(
      screen.getByRole('heading', { level: 3, name: 'No Releases Yet' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('runs the primary and secondary handlers', async () => {
    const user = userEvent.setup();
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    const { container } = render(
      <EmptyState
        heading='No Contacts Yet'
        description='Add bookings, management, and press contacts.'
        action={{
          label: 'Add Contact',
          onClick: onPrimary,
          shortcut: 'N then C',
        }}
        secondaryAction={{ label: 'Import CSV', onClick: onSecondary }}
      />
    );

    // The shortcut is now part of the accessible name (visible keycap text).
    await user.click(screen.getByRole('button', { name: 'Add Contact N then C' }));
    await user.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(screen.getByText('then')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders link actions and keeps a disabled link action inert', async () => {
    const { container, rerender } = render(
      <EmptyState
        heading='No Tours Yet'
        action={{ label: 'Connect Bandsintown', href: '/app/settings/touring' }}
        secondaryAction={{ label: 'Learn more', href: '/support' }}
      />
    );

    expect(
      screen.getByRole('link', { name: 'Connect Bandsintown' })
    ).toHaveAttribute('href', '/app/settings/touring');
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      '/support'
    );
    await expectNoA11yViolations(container);

    rerender(
      <EmptyState
        heading='No Tours Yet'
        action={{
          label: 'Connect Bandsintown',
          href: '/app/settings/touring',
          disabled: true,
        }}
      />
    );
    expect(
      screen.queryByRole('link', { name: 'Connect Bandsintown' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect Bandsintown' })
    ).toBeDisabled();
  });

  it('marks the error variant as an error content state', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { container } = render(
      <EmptyState
        variant='error'
        icon={<AlertTriangle className='h-5 w-5' />}
        heading='Could Not Load Releases'
        description='Check your connection and try again.'
        action={{ label: 'Try Again', onClick: retry }}
      />
    );

    expect(screen.getByRole('status')).toHaveAttribute(
      'data-content-state',
      'error'
    );
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for the permission variant', async () => {
    const { container } = render(
      <EmptyState
        variant='permission'
        icon={<Lock className='h-5 w-5' />}
        heading='Admins Only'
        description='Ask a workspace admin for access.'
      />
    );

    expect(screen.getByRole('status')).toHaveAttribute(
      'data-content-state',
      'empty'
    );
    await expectNoA11yViolations(container);
  });

  it('renders a heading-only state without describing or acting', async () => {
    const { container } = render(<EmptyState heading='Nothing Here Yet' />);

    const region = screen.getByRole('status', { name: 'Nothing Here Yet' });
    expect(region).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('wraps workspace content in its card', async () => {
    const { container } = render(
      <EmptyState
        presentation='workspace'
        heading='No Contacts Yet'
        description='Add bookings, management, and press contacts.'
        actionSlot={<button type='button'>Enable alerts</button>}
      />
    );

    expect(container.querySelector('[data-empty-state-card]')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Enable alerts' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for long right-to-left copy', async () => {
    const { container } = render(
      <div dir='rtl'>
        <EmptyState
          heading='لا توجد إصدارات حتى الآن في مكتبتك'
          description='اربط حسابك على سبوتيفاي لاستيراد كتالوجك الكامل والأغاني المنفردة والألبومات تلقائيًا.'
          action={{ label: 'ربط سبوتيفاي', onClick: () => undefined }}
        />
      </div>
    );

    expect(
      screen.getByRole('status', { name: 'لا توجد إصدارات حتى الآن في مكتبتك' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
