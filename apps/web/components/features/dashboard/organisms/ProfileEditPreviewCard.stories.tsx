import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import {
  type ProfileEditPreview,
  ProfileEditPreviewCard,
} from './ProfileEditPreviewCard';

const profileId = 'storybook-profile';

const displayNamePreview: ProfileEditPreview = {
  field: 'displayName',
  fieldLabel: 'Display name',
  currentValue: 'Old Name',
  newValue: 'New Name',
  reason: 'Better branding',
};

const meta = {
  title: 'Dashboard/Organisms/ProfileEditPreviewCard',
  component: ProfileEditPreviewCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    profileId,
    preview: displayNamePreview,
  },
} satisfies Meta<typeof ProfileEditPreviewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSourceProvenance: Story = {
  args: {
    preview: {
      field: 'bio',
      fieldLabel: 'Artist bio/description',
      currentValue: 'Old bio',
      newValue: 'New bio about the artist',
      reason: 'Imported from a public source',
      sourceUrl: 'https://example.com/artist',
      sourceTitle: 'Example artist page',
    },
  },
};

export const UnsetCurrentValue: Story = {
  args: {
    preview: {
      field: 'genres',
      fieldLabel: 'Genres',
      currentValue: null,
      newValue: ['Indie', 'Alternative'],
    },
  },
};

/** How the story's local /api/chat/confirm-edit endpoint answers. */
type ConfirmReply = 'pending' | 'server-error' | 'offline';

/**
 * Stories never reach /api/chat/confirm-edit: fetch is replaced for the life
 * of the story and restored on unmount, and any other request throws. No
 * reply ever succeeds, so no profile is edited.
 */
function LocalConfirmEditApi({
  reply,
  children,
}: {
  readonly reply: ConfirmReply;
  readonly children: ReactNode;
}) {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => {
      if (!String(input).includes('/api/chat/confirm-edit')) {
        throw new Error(
          'Unexpected network request in ProfileEditPreviewCard story.'
        );
      }
      if (reply === 'pending') return new Promise<Response>(() => undefined);
      if (reply === 'offline') throw new TypeError('Failed to fetch');
      return new Response(
        JSON.stringify({ error: 'Stories never apply edits.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [reply]);

  return <>{children}</>;
}

const withConfirmEdit = (reply: ConfirmReply): Decorator => {
  function WithConfirmEdit(Story: Parameters<Decorator>[0]) {
    return (
      <LocalConfirmEditApi reply={reply}>
        <Story />
      </LocalConfirmEditApi>
    );
  }
  return WithConfirmEdit;
};

async function pressApply(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /apply/i }));
  return canvas;
}

export const LoadingApply: Story = {
  decorators: [withConfirmEdit('pending')],
  play: async ({ canvasElement }) => {
    const canvas = await pressApply(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: /applying/i })
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: /cancel/i })
    ).toBeDisabled();
  },
};

/** The edit is rejected; the card stays editable so the user can retry. */
export const ErrorApplyFailed: Story = {
  decorators: [withConfirmEdit('server-error')],
  play: async ({ canvasElement }) => {
    const canvas = await pressApply(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: /^apply$/i })
    ).toBeEnabled();
    await expect(canvas.queryByText('Applied')).not.toBeInTheDocument();
  },
};

export const OfflineApply: Story = {
  decorators: [withConfirmEdit('offline')],
  play: async ({ canvasElement }) => {
    const canvas = await pressApply(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: /^apply$/i })
    ).toBeEnabled();
    await expect(canvas.queryByText('Applied')).not.toBeInTheDocument();
  },
};

export const EmptyGenres: Story = {
  args: {
    preview: {
      field: 'genres',
      fieldLabel: 'Genres',
      currentValue: [],
      newValue: [],
    },
  },
};

/** Provenance arrived with a source URL but no reason or page title. */
export const PartialProvenance: Story = {
  args: {
    preview: {
      field: 'bio',
      fieldLabel: 'Artist bio/description',
      currentValue: null,
      newValue: 'Producer and DJ from Los Angeles.',
      sourceUrl: 'https://www.example.com/press/artist',
    },
  },
};

export const LongContentBio: Story = {
  args: {
    preview: {
      field: 'bio',
      fieldLabel: 'Artist bio/description',
      currentValue:
        'Los Angeles producer and DJ blending house, disco and left-field pop across a decade of club residencies.',
      newValue:
        'Los Angeles producer, DJ and label founder whose records blend deep house, nu-disco and left-field pop. Over a decade of residencies across Los Angeles, Ibiza and Berlin, plus remixes for independent and major-label artists, have made the live sets a fixture of the West Coast club calendar.',
      reason:
        'Your press kit on the label site describes the residencies and remix work in more detail than the current bio, so this version brings the two in line.',
      sourceUrl:
        'https://press.an-extremely-long-independent-label-domain-name.example.com/artists/press-kit',
    },
  },
  render: args => (
    <div className='w-80'>
      <ProfileEditPreviewCard {...args} />
    </div>
  ),
};

export const RtlPreview: Story = {
  args: {
    preview: {
      field: 'displayName',
      fieldLabel: 'الاسم المعروض',
      currentValue: 'الاسم القديم',
      newValue: 'الاسم الجديد',
      reason: 'علامة تجارية أوضح',
    },
  },
  render: args => (
    <div dir='rtl' className='w-80'>
      <ProfileEditPreviewCard {...args} />
    </div>
  ),
};
