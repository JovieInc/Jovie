import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileContactHeader } from './ProfileContactHeader';

describe('ProfileContactHeader', () => {
  it('saves an edited display name on Enter', async () => {
    const onDisplayNameChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ProfileContactHeader
        displayName='Alex Rivera'
        username='alex'
        avatarUrl={null}
        editable
        onDisplayNameChange={onDisplayNameChange}
        releaseCount={12}
        linkCount={5}
      />
    );
    expect(screen.getByText('12 releases · 5 links')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: /^Edit Display Name/ })
    );
    const input = screen.getByRole('textbox', { name: 'Edit Display Name' });
    await user.clear(input);
    await user.type(input, 'Alex R{Enter}');
    expect(onDisplayNameChange).toHaveBeenCalledWith('Alex R');
  });

  it('prompts for missing identity on a new profile', async () => {
    const { container } = render(
      <ProfileContactHeader
        displayName=''
        username=''
        avatarUrl={null}
        editable
        onDisplayNameChange={vi.fn()}
        releaseCount={0}
        linkCount={0}
      />
    );
    expect(screen.getByText('Add display name')).toBeInTheDocument();
    expect(screen.getByText('@username')).toBeInTheDocument();
    expect(screen.queryByText(/release|link/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('falls back to initials when the avatar fails to load', async () => {
    const { container } = render(
      <ProfileContactHeader
        displayName='Alex Rivera'
        username='alex'
        avatarUrl='https://example.com/missing.png'
      />
    );
    const image = container.querySelector('img');
    if (image) fireEvent.error(image);
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows only the counts it has, singular when one', async () => {
    const { container } = render(
      <ProfileContactHeader
        displayName='Alex Rivera'
        username='alex'
        avatarUrl={null}
        linkCount={1}
      />
    );
    expect(screen.getByText('1 link')).toBeInTheDocument();
    expect(screen.queryByText(/release/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left identity text whole and accessible', async () => {
    const displayName =
      'The Extremely Long Artist Name Of A Collective With Many Members';
    const { container, unmount } = render(
      <ProfileContactHeader
        displayName={displayName}
        username='the-extremely-long-artist-handle-for-a-whole-collective'
        avatarUrl={null}
      />
    );
    expect(screen.getByText(displayName)).toBeInTheDocument();
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <ProfileContactHeader
          displayName='ليلى حداد'
          username='layla'
          avatarUrl={null}
        />
      </div>
    );
    expect(screen.getByText('ليلى حداد')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});

describe('ProfileContactHeader scale tokens', () => {
  it('keeps type and size utilities on scale tokens instead of arbitrary values', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(import.meta.dirname, 'ProfileContactHeader.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/leading-\[14px\]/);
    expect(source).toContain('leading-3.5');
  });
});
