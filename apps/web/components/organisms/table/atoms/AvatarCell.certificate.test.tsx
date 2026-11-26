import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AvatarCell } from './AvatarCell';

const base = {
  profileId: 'artist-1',
  username: 'tim',
  avatarUrl: null,
  displayName: 'Tim White',
} as const;

describe('AvatarCell certificate', () => {
  it('keeps the name, profile link and featured star axe-clean', async () => {
    const { container } = render(<AvatarCell {...base} isFeatured />);

    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '@tim' })).toHaveAttribute(
      'href',
      '/tim'
    );
    expect(screen.getByLabelText('Featured')).toHaveClass('text-warning');
    await expectNoA11yViolations(container);
  });

  it('renders a plain handle when the link is disabled and trailing actions', async () => {
    const { container } = render(
      <AvatarCell
        {...base}
        disableUsernameLink
        usernameActions={<span>Actions slot</span>}
      />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('@tim')).toBeInTheDocument();
    expect(screen.getByText('Actions slot')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long names and a custom class in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AvatarCell
          {...base}
          displayName='تيم وايت'
          className='custom'
          verified
        />
      </div>
    );

    expect(screen.getByText('تيم وايت')).toBeInTheDocument();
    expect(container.querySelector('.group.custom')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
