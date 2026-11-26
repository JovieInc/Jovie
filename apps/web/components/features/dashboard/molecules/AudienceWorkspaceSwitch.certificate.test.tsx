import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceWorkspaceSwitch } from './AudienceWorkspaceSwitch';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/app/audience',
  useSearchParams: () => new URLSearchParams('q=berlin'),
}));

describe('AudienceWorkspaceSwitch certificate', () => {
  it.each(['audience', 'contacts', 'insights'] as const)(
    'selects %s and stays axe-clean',
    async value => {
      const { container } = render(<AudienceWorkspaceSwitch value={value} />);
      const selected = screen
        .getAllByRole('tab')
        .filter(tab => tab.getAttribute('aria-selected') === 'true');
      expect(selected).toHaveLength(1);
      await expectNoA11yViolations(container);
    }
  );

  it('navigates when another segment is chosen', async () => {
    push.mockClear();
    render(<AudienceWorkspaceSwitch value='audience' />);
    await userEvent.click(screen.getByRole('tab', { name: 'Insights' }));
    expect(push).toHaveBeenCalled();
  });
});
