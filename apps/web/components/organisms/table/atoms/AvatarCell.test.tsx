import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineIconButton } from '@/components/atoms/InlineIconButton';
import { AvatarCell } from './AvatarCell';

describe('AvatarCell', () => {
  it.each([null, ''])(
    'keeps the profile link without a display name: %s',
    displayName => {
      const rowClick = vi.fn();
      render(
        <table>
          <tbody>
            <tr onClick={rowClick}>
              <td>
                <AvatarCell
                  profileId='creator'
                  username='artist'
                  displayName={displayName}
                  avatarUrl={null}
                />
              </td>
            </tr>
          </tbody>
        </table>
      );
      const link = screen.getByRole('link', { name: '@artist' });
      expect(link).toHaveAttribute('href', '/artist');
      expect(screen.getAllByText('@artist')).toHaveLength(1);
      fireEvent.click(link);
      expect(rowClick).not.toHaveBeenCalled();
    }
  );

  it('renders the creator name, profile link, and a read-only face on one line', () => {
    const { container } = render(
      <AvatarCell
        profileId='creator'
        username='artist'
        displayName='An Artist'
        avatarUrl={null}
        verified
        isFeatured
      />
    );
    expect(screen.getByText('An Artist')).toBeVisible();
    expect(screen.getByRole('link', { name: '@artist' })).toHaveAttribute(
      'href',
      '/artist'
    );
    expect(
      container.querySelector('[data-slot="app-avatar"]')
    ).toBeInTheDocument();
    // One-line people row: a 20px face, never an upload control in a table.
    expect(
      container.querySelector('[data-slot="app-avatar-frame"]')
    ).toHaveAttribute('data-size', 'sm');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Featured')).toBeInTheDocument();
  });

  it('keeps row actions usable when the username is plain text', () => {
    const onClick = vi.fn();
    render(
      <AvatarCell
        profileId='creator'
        username='artist'
        avatarUrl={null}
        disableUsernameLink
        usernameActions={
          <InlineIconButton
            size='xs'
            aria-label='Copy artist'
            onClick={onClick}
          >
            <svg aria-hidden='true' />
          </InlineIconButton>
        }
      />
    );
    expect(screen.getByText('@artist')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy artist' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
