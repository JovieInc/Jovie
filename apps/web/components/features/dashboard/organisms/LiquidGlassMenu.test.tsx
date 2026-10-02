import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home, Users } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { LiquidGlassMenu } from './LiquidGlassMenu';

const { mockPathname } = vi.hoisted(() => ({
  mockPathname: vi.fn(() => APP_ROUTES.CONTACTS),
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
});
