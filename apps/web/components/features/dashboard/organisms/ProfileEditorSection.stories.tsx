import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useRef, useState } from 'react';
import type { Artist } from '@/types/db';
import type { EditingField } from './links/hooks/useProfileEditor';
import { ProfileEditorSection } from './ProfileEditorSection';

const artist = { id: 'artist-1', handle: 'novalane' } as Artist;

interface DemoProps {
  readonly initialName: string;
  readonly initialHandle: string;
  readonly initialEditing?: EditingField;
}

function ProfileEditorDemo({
  initialName,
  initialHandle,
  initialEditing = null,
}: DemoProps) {
  const [name, setName] = useState(initialName);
  const [handle, setHandle] = useState(initialHandle);
  const [editing, setEditing] = useState<EditingField>(initialEditing);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const handleRef = useRef<HTMLInputElement | null>(null);

  return (
    <ProfileEditorSection
      artist={artist}
      avatarUrl={null}
      username={handle}
      displayName={name}
      editingField={editing}
      setEditingField={setEditing}
      displayNameInputRef={nameRef}
      usernameInputRef={handleRef}
      profileDisplayName={name}
      profileUsername={handle}
      onDisplayNameChange={setName}
      onUsernameChange={setHandle}
      onAvatarUpload={async () => 'https://example.com/avatar.png'}
      onInputKeyDown={event => {
        if (event.key === 'Escape') setEditing(null);
      }}
      onInputBlur={() => setEditing(null)}
    />
  );
}

const meta = {
  title: 'Dashboard/Organisms/ProfileEditorSection',
  component: ProfileEditorDemo,
  parameters: { layout: 'centered' },
  args: { initialName: 'Nova Lane', initialHandle: 'novalane' },
} satisfies Meta<typeof ProfileEditorDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: neither field has a value yet. */
export const Empty: Story = { args: { initialName: '', initialHandle: '' } };

/** Partial: only the display name is set. */
export const Partial: Story = { args: { initialHandle: '' } };

/** Editing: the display name input is open. */
export const EditingDisplayName: Story = {
  args: { initialEditing: 'displayName' },
};

/** Long content: values that overflow the card. */
export const LongContent: Story = {
  args: {
    initialName: 'Nova Lane and the Extraordinarily Long Named Orchestra',
    initialHandle: 'nova_lane_and_the_extraordinarily_long_handle',
  },
};

/** Rtl: right-to-left values and layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: { initialName: 'نوفا لين', initialHandle: 'novalane' },
};
