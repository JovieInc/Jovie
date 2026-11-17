import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_URL } from '@/constants/domains';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileNavButton } from './ProfileNavButton';

const auth = vi.hoisted(() => ({ isSignedIn: false }));
const breakpoint = vi.hoisted(() => ({ isMdUp: false }));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: auth.isSignedIn }),
}));
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: () => breakpoint.isMdUp,
}));

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
  await screen.findByRole('menu');
  return user;
}

describe('ProfileNavButton', () => {
  beforeEach(() => {
    auth.isSignedIn = false;
    breakpoint.isMdUp = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the logo menu trigger, axe-clean', async () => {
    const { container } = render(
      <ProfileNavButton showBackButton={false} artistHandle='testartist' />
    );

    const trigger = screen.getByRole('button', { name: 'Open profile menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.animate-pulse')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('pulses the logo while loading', async () => {
    const { container } = render(
      <ProfileNavButton
        showBackButton={false}
        artistHandle='testartist'
        loading
      />
    );

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('opens a signed-out menu without the dashboard or phone items', async () => {
    render(
      <ProfileNavButton showBackButton={false} artistHandle='testartist' />
    );
    await openMenu();

    expect(
      screen.getByRole('button', { name: 'Open profile menu', hidden: true })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('menuitem', { name: 'Dashboard' })).toBeNull();
    expect(
      screen.queryByRole('menuitem', { name: 'Open On Phone' })
    ).toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Claim your profile' })
    ).toHaveAttribute('href', '/signup');
    expect(
      screen.getByRole('menuitem', { name: 'Your Privacy Choices' })
    ).toHaveAttribute('href', '/legal/privacy#privacy-choices');
    await expectNoA11yViolations(screen.getByRole('menu'));
  });

  it('shows the dashboard link when signed in and the phone item on wide screens', async () => {
    auth.isSignedIn = true;
    breakpoint.isMdUp = true;
    const listener = vi.fn();
    globalThis.addEventListener('jovie:open-profile-qr', listener);
    render(
      <ProfileNavButton showBackButton={false} artistHandle='testartist' />
    );
    const user = await openMenu();

    expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/app'
    );
    await user.click(screen.getByRole('menuitem', { name: 'Open On Phone' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    globalThis.removeEventListener('jovie:open-profile-qr', listener);
  });

  it('copies the full profile URL', async () => {
    render(
      <ProfileNavButton showBackButton={false} artistHandle='testartist' />
    );
    const user = await openMenu();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    await user.click(
      screen.getByRole('menuitem', { name: 'Copy profile link' })
    );

    expect(writeText).toHaveBeenCalledWith(`${BASE_URL}/testartist`);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('swallows a clipboard failure without throwing', async () => {
    render(
      <ProfileNavButton showBackButton={false} artistHandle='testartist' />
    );
    const user = await openMenu();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('denied'));

    await user.click(
      screen.getByRole('menuitem', { name: 'Copy profile link' })
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(
      screen.getByRole('button', { name: 'Open profile menu' })
    ).toBeVisible();
  });

  it('opens the legal submenu', async () => {
    render(
      <ProfileNavButton showBackButton={false} artistHandle='testartist' />
    );
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Legal' }));

    expect(
      await screen.findByRole('menuitem', { name: 'Privacy' })
    ).toHaveAttribute('href', '/legal/privacy');
    expect(screen.getByRole('menuitem', { name: 'Terms' })).toHaveAttribute(
      'target',
      '_blank'
    );
  });

  it('renders a back link to the profile on sub-pages', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ProfileNavButton showBackButton artistHandle='testartist' />
      </div>
    );

    const back = screen.getByRole('link', { name: 'Back to profile' });
    expect(back).toHaveAttribute('href', '/testartist');
    expect(back).toHaveAttribute('data-testid', 'back-button');
    expect(
      screen.queryByRole('button', { name: 'Open profile menu' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });
});
