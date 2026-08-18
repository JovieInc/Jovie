import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteSegmentControl } from './RouteSegmentControl';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const options = [
  { value: 'contacts', label: 'Contacts', href: '/app/contacts' },
  {
    value: 'audience',
    label: 'Audience',
    href: '/app/contacts?tab=audience',
  },
] as const;

describe('RouteSegmentControl', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('exposes canonical selected and focusable tab semantics', () => {
    render(
      <RouteSegmentControl
        value='contacts'
        options={options}
        aria-label='Contacts Workspace'
      />
    );

    const tablist = screen.getByRole('tablist', {
      name: 'Contacts Workspace',
    });
    const contacts = screen.getByRole('tab', { name: 'Contacts' });
    const audience = screen.getByRole('tab', { name: 'Audience' });

    expect(tablist).toBeVisible();
    expect(contacts).toHaveAttribute('aria-selected', 'true');
    expect(audience).toHaveAttribute('aria-selected', 'false');
    expect(contacts.className).toContain('before:h-11');
    expect(contacts.className).toContain('focus-visible:ring-2');
    contacts.focus();
    expect(contacts).toHaveFocus();
  });

  it('navigates by pointer and preserves Radix keyboard focus behavior', async () => {
    const user = userEvent.setup();
    render(
      <RouteSegmentControl
        value='contacts'
        options={options}
        aria-label='Contacts Workspace'
      />
    );

    const contacts = screen.getByRole('tab', { name: 'Contacts' });
    const audience = screen.getByRole('tab', { name: 'Audience' });

    await user.click(audience);
    expect(pushMock).toHaveBeenCalledWith('/app/contacts?tab=audience');

    contacts.focus();
    await user.keyboard('{ArrowRight}');
    expect(audience).toHaveFocus();
  });

  it('fills narrow containers without forcing a minimum control width', () => {
    render(
      <div className='w-40'>
        <RouteSegmentControl
          value='contacts'
          options={options}
          aria-label='Contacts Workspace'
          className='max-w-60'
        />
      </div>
    );

    const tablist = screen.getByRole('tablist', {
      name: 'Contacts Workspace',
    });
    const root = tablist.parentElement;
    expect(root?.className).toContain('w-full');
    expect(root?.className).toContain('max-w-60');
  });

  it('does not navigate for the selected or disabled route', async () => {
    const user = userEvent.setup();
    render(
      <RouteSegmentControl
        value='contacts'
        options={[options[0], { ...options[1], disabled: true }]}
        aria-label='Contacts Workspace'
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Contacts' }));
    await user.click(screen.getByRole('tab', { name: 'Audience' }));

    expect(pushMock).not.toHaveBeenCalled();
  });
});
