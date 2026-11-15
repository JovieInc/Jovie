import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

describe('RouteSegmentControl certificate', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('is axe-clean and does not navigate to the route already shown', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RouteSegmentControl
        value='contacts'
        options={options}
        aria-label='Contacts Workspace'
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Contacts' }));
    expect(pushMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps a disabled route from navigating (partial)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RouteSegmentControl
        value='contacts'
        options={[
          options[0],
          {
            ...options[1],
            disabled: true,
            ariaLabel: 'Audience (not available yet)',
          },
        ]}
        aria-label='Contacts Workspace'
      />
    );

    const audience = screen.getByRole('tab', {
      name: 'Audience (not available yet)',
    });
    expect(audience).toBeDisabled();
    await user.click(audience);
    expect(pushMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('navigates from long and RTL labels, axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl'>
        <RouteSegmentControl
          value='contacts'
          options={[
            { value: 'contacts', label: 'جهات الاتصال', href: '/app/contacts' },
            {
              value: 'audience',
              label: 'Audience and subscribers',
              href: '/app/contacts?tab=audience',
            },
          ]}
          aria-label='مساحة جهات الاتصال'
        />
      </div>
    );

    expect(
      screen.getByRole('tablist', { name: 'مساحة جهات الاتصال' })
    ).toBeVisible();
    await user.click(
      screen.getByRole('tab', { name: 'Audience and subscribers' })
    );
    expect(pushMock).toHaveBeenCalledWith('/app/contacts?tab=audience');
    await expectNoA11yViolations(container);
  });
});
