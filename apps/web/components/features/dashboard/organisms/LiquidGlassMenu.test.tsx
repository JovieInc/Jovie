import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home, Users } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LiquidGlassMenu } from './LiquidGlassMenu';

const { mockPathname } = vi.hoisted(() => ({
  mockPathname: vi.fn((): string => APP_ROUTES.CONTACTS),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('LiquidGlassMenu', () => {
  beforeEach(() => {
    mockPathname.mockReset();
    mockPathname.mockReturnValue(APP_ROUTES.CONTACTS);
  });

  it('closes the expanded menu when activating a same-path query destination', async () => {
    const user = userEvent.setup();
    const onItemActivate = vi.fn();

    render(
      <LiquidGlassMenu
        primaryItems={[
          {
            id: 'home',
            label: 'Home',
            href: APP_ROUTES.DASHBOARD,
            icon: Home,
          },
        ]}
        expandedItems={[
          {
            id: 'audience',
            label: 'Audience',
            href: APP_ROUTES.CONTACTS_AUDIENCE,
            icon: Users,
          },
        ]}
        onItemActivate={onItemActivate}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More options' }));
    const audienceLink = screen.getByRole('link', { name: 'Audience' });
    audienceLink.addEventListener('click', event => event.preventDefault());
    await user.click(audienceLink);

    expect(
      screen.queryByRole('dialog', { name: 'Expanded Navigation Menu' })
    ).not.toBeInTheDocument();
    expect(onItemActivate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: 'audience',
        href: APP_ROUTES.CONTACTS_AUDIENCE,
      }),
      'pointer'
    );
  });

  const primary = [
    { id: 'home', label: 'Home', href: APP_ROUTES.DASHBOARD, icon: Home },
  ];
  const expanded = [
    {
      id: 'audience',
      label: 'Audience',
      href: APP_ROUTES.CONTACTS_AUDIENCE,
      icon: Users,
      badge: 120,
    },
  ];

  it('runs search and sign out from PlainButton controls and paints the scrim token', async () => {
    const user = userEvent.setup();
    const onSearchClick = vi.fn();
    const onSignOut = vi.fn();
    const { container } = render(
      <LiquidGlassMenu
        primaryItems={primary}
        expandedItems={expanded}
        onSearchClick={onSearchClick}
        onSignOut={onSignOut}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearchClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute(
      'data-slot',
      'plain-button'
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByText('99+')).toBeInTheDocument();
    const scrim = container.querySelector('[data-modal-backdrop]');
    expect(scrim).toHaveClass('bg-ink-on-media/20');
    expect(scrim).not.toHaveClass('bg-black/20');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('closes the open menu on Escape and on an outside click', async () => {
    const user = userEvent.setup();
    render(<LiquidGlassMenu primaryItems={primary} expandedItems={expanded} />);
    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More options' }));
    await new Promise(resolve => setTimeout(resolve, 20));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('re-arms Escape after closing and reopening', async () => {
    const user = userEvent.setup();
    render(<LiquidGlassMenu primaryItems={primary} expandedItems={expanded} />);
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('LiquidGlassMenu press', () => {
  it('presses its destinations and toggle through the shared press utility', () => {
    mockPathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    render(
      <LiquidGlassMenu
        primaryItems={[
          {
            id: 'home',
            label: 'Home',
            href: APP_ROUTES.DASHBOARD,
            icon: Home,
          },
        ]}
        expandedItems={[]}
      />
    );
    expect(screen.getByRole('link', { name: /home/i })).toHaveClass('press');
    expect(screen.getByRole('button', { name: /more options/i })).toHaveClass(
      'press'
    );
  });
});
