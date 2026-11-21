import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import type { EditingField } from './links/hooks/useProfileEditor';
import { ProfileEditorSection } from './ProfileEditorSection';

vi.mock('@/components/feedback', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/components/organisms/AvatarUploadable', () => ({
  AvatarUploadable: ({ alt }: { readonly alt: string }) => (
    <div role='img' aria-label={alt} />
  ),
}));

const artist = { id: 'artist-1', handle: 'novalane' } as Artist;

function Harness({
  name = 'Nova Lane',
  handle = 'novalane',
  initialEditing = null,
  spies,
}: {
  readonly name?: string;
  readonly handle?: string;
  readonly initialEditing?: EditingField;
  readonly spies?: { blur: () => void };
}) {
  const [displayName, setDisplayName] = useState(name);
  const [username, setUsername] = useState(handle);
  const [editing, setEditing] = useState<EditingField>(initialEditing);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const handleRef = useRef<HTMLInputElement | null>(null);

  return (
    <ProfileEditorSection
      artist={artist}
      avatarUrl={null}
      username={username}
      displayName={displayName}
      editingField={editing}
      setEditingField={setEditing}
      displayNameInputRef={nameRef}
      usernameInputRef={handleRef}
      profileDisplayName={displayName}
      profileUsername={username}
      onDisplayNameChange={setDisplayName}
      onUsernameChange={setUsername}
      onAvatarUpload={async () => 'https://example.com/a.png'}
      onInputKeyDown={event => {
        if (event.key === 'Escape') setEditing(null);
      }}
      onInputBlur={() => spies?.blur()}
    />
  );
}

describe('ProfileEditorSection', () => {
  it('shows values and empty prompts as edit buttons', async () => {
    const { container } = render(<Harness name='' handle='novalane' />);
    expect(
      screen.getByRole('button', { name: 'Edit display name' })
    ).toHaveTextContent('Add display name');
    expect(
      screen.getByRole('button', { name: 'Edit username' })
    ).toHaveTextContent('novalane');
    await expectNoA11yViolations(container);
  });

  it('opens an input, keeps typed text across re-renders and closes on Escape', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Edit display name' }));
    const input = screen.getByRole('textbox', { name: 'Display Name' });
    await user.clear(input);
    await user.type(input, 'Sasha Waves');
    expect(input).toHaveValue('Sasha Waves');

    rerender(<Harness />);
    expect(screen.getByRole('textbox', { name: 'Display Name' })).toBeVisible();
    await expectNoA11yViolations(container);

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('textbox', { name: 'Display Name' })
    ).not.toBeInTheDocument();
  });

  it('edits the username and reports blur', async () => {
    const user = userEvent.setup();
    const blur = vi.fn();
    render(<Harness spies={{ blur }} />);

    await user.click(screen.getByRole('button', { name: 'Edit username' }));
    const input = screen.getByRole('textbox', { name: 'Username' });
    await user.type(input, 'x');
    expect(input).toHaveValue('novalanex');
    await user.tab();
    expect(blur).toHaveBeenCalled();
  });
});
