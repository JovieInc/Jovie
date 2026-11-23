import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceMobileCard } from './AudienceMobileCard';
import { member } from './audienceMobileCard.test-fixtures';

describe('AudienceMobileCard', () => {
  it('opens details and messages without invoking the row action', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    const onAction = vi.fn();
    const { container } = render(
      <AudienceMobileCard
        member={member}
        mode='members'
        onTap={onTap}
        onAction={onAction}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Message Jamie Rivera' })
    );
    expect(onAction).toHaveBeenCalledWith(member);
    expect(onTap).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'View details for Jamie Rivera' })
    );
    expect(onTap).toHaveBeenCalledWith(member);
    await expectNoA11yViolations(container);
  });

  it('renders a selected member accessibly', async () => {
    const { container } = render(
      <AudienceMobileCard
        member={member}
        mode='members'
        isSelected
        onTap={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'View details for Jamie Rivera' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a long RTL name accessibly', async () => {
    const longName = 'موسيقي ذو اسم طويل يحتاج إلى مساحة كافية';
    const { container } = render(
      <div dir='rtl'>
        <AudienceMobileCard
          member={{ ...member, displayName: longName }}
          mode='members'
          onTap={vi.fn()}
        />
      </div>
    );
    expect(
      screen.getByRole('button', { name: `View details for ${longName}` })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the details action for an anonymous visitor without messaging', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    const anonymous = {
      ...member,
      type: 'anonymous' as const,
      displayName: null,
      email: null,
    };
    const { container } = render(
      <AudienceMobileCard member={anonymous} mode='members' onTap={onTap} />
    );
    expect(
      screen.queryByRole('button', { name: /message/i })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /view details/i }));
    expect(onTap).toHaveBeenCalledWith(anonymous);
    await expectNoA11yViolations(container);
  });

  it('shows the state as a quiet StatusCell dot, not a filled pill', () => {
    const { container } = render(
      <AudienceMobileCard
        member={{ ...member, intentLevel: 'high' }}
        mode='members'
        onTap={vi.fn()}
      />
    );
    const status = container.querySelector('[data-status-cell]');
    expect(status).not.toBeNull();
    expect(status?.className).not.toMatch(/(^|\s)(bg-|ring-|border)/);
    expect(status?.querySelector('[aria-hidden="true"]')).toHaveClass(
      'size-1.5',
      'rounded-full'
    );
    expect(status?.textContent?.trim().length).toBeGreaterThan(0);
  });
});
