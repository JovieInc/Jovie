import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Music } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NavMenuItem } from './NavMenuItem';

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => false,
}));

const item = {
  id: 'library',
  name: 'Library',
  href: '/app/library',
  icon: Music,
};

function inList(node: ReactNode) {
  return <ul>{node}</ul>;
}

describe('NavMenuItem certificate', () => {
  it('renders a button row that reports its pressed state and runs its handlers', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onNavigate = vi.fn();
    const onPrefetch = vi.fn();
    const { container } = render(
      inList(
        <NavMenuItem
          item={item}
          isActive
          renderAsButton
          onClick={onClick}
          onNavigate={onNavigate}
          onPrefetch={onPrefetch}
        />
      )
    );

    const button = screen.getByRole('button', { name: 'Library' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('data-navigation-item-id', 'library');

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalled();
    expect(onPrefetch).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('marks a pending destination busy without changing its role', async () => {
    const { container } = render(
      inList(<NavMenuItem item={item} isActive={false} pending />)
    );
    const link = screen.getByRole('link', { name: 'Library' });
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveAttribute('data-navigation-pending', 'true');
    await expectNoA11yViolations(container);
  });

  it('keeps link markup but blocks navigation when asked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onActivate = vi.fn();
    const { container } = render(
      inList(
        <NavMenuItem
          item={item}
          isActive={false}
          preventNavigation
          onClick={onClick}
          onActivate={onActivate}
        />
      )
    );
    const link = screen.getByRole('link', { name: 'Library' });
    expect(link).toHaveAttribute('aria-disabled', 'true');

    await user.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('reports a plain same-tab activation', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      inList(
        <NavMenuItem item={item} isActive={false} onActivate={onActivate} />
      )
    );
    const link = screen.getByRole('link', { name: 'Library' });
    link.addEventListener('click', event => event.preventDefault());
    await user.click(link);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('renders a long label with its badge and an Arabic label right to left', async () => {
    const name =
      'A deliberately long destination name that fades at the rail edge';
    const { container, rerender } = render(
      inList(
        <NavMenuItem
          item={{ ...item, name, badge: <span>128</span> }}
          isActive={false}
        />
      )
    );
    expect(screen.getByText(name)).toHaveClass('truncate');
    expect(screen.getByText('128')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <ul dir='rtl' lang='ar'>
        <NavMenuItem item={{ ...item, name: 'المكتبة' }} isActive={false} />
      </ul>
    );
    expect(screen.getByRole('link', { name: 'المكتبة' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
