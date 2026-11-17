import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsRouteSkeleton } from './SettingsRouteSkeleton';

describe('SettingsRouteSkeleton', () => {
  it('holds one section header and three field rows inside the settings layout, axe-clean', async () => {
    const { container } = render(<SettingsRouteSkeleton />);

    const shell = screen.getByTestId('settings-shell-content');
    const status = within(shell).getByRole('status', {
      name: 'Loading Settings',
    });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');

    const section = status.querySelector('section');
    expect(section).toHaveAttribute('aria-hidden', 'true');
    expect(
      section?.querySelector('[data-skeleton-slot="settings-section-header"]')
    ).not.toBeNull();
    expect(section?.lastElementChild?.children).toHaveLength(3);
    expect(status.textContent).toBe('');

    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SettingsRouteSkeleton />
      </div>
    );
    expect(screen.getByTestId('settings-route-skeleton')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
