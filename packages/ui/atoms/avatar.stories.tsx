import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarStatusDot,
  UserAvatar,
} from './avatar';

const meta: Meta<typeof Avatar> = {
  title: 'UI/Atoms/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

// Valid data URL, deliberately undecodable image bytes: native onError without
// an unrelated network/TLS failure or a missing-resource console error.
const FAILED_PORTRAIT_SRC = 'data:image/png;base64,bm90LWFuLWltYWdl';

export const Default: Story = {
  render: () => (
    <Avatar size='lg'>
      <AvatarFallback>TW</AvatarFallback>
    </Avatar>
  ),
};

export const WithImage: Story = {
  render: () => (
    <Avatar size='lg' ring>
      <AvatarImage src='/images/avatars/tim-white.jpg' alt='Tim White' />
      <AvatarStatusDot status='online' size='lg' />
    </Avatar>
  ),
};

export const ArtworkComposition: Story = {
  render: () => (
    <div className='flex items-end gap-6'>
      <div className='grid justify-items-center gap-2'>
        <Avatar size='2xl' shape='artwork'>
          <AvatarImage
            src='/images/mock-profile/tim-white-dont-look-down-card.jpg'
            alt='Full release artwork using inherited props'
          />
        </Avatar>
        <span className='text-xs text-tertiary-token'>Inherited</span>
      </div>
      <div className='grid justify-items-center gap-2'>
        <Avatar size='2xl' shape='artwork'>
          <AvatarImage
            src='/images/mock-profile/tim-white-dont-look-down-card.jpg'
            alt='Full release artwork using explicit props'
            size='2xl'
            shape='artwork'
          />
        </Avatar>
        <span className='text-xs text-tertiary-token'>Explicit</span>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Artwork children inherit the parent rounded-square geometry and preserve the full image with contain fit; explicit matching props remain supported.',
      },
    },
  },
};

export const User: Story = {
  render: () => <UserAvatar name='Tim White' size='xl' status='away' />,
};

export const ImageFailure: Story = {
  args: { size: 'lg', ring: true },
  render: ({ size, ring }) => (
    <UserAvatar
      name='Tim White'
      src={FAILED_PORTRAIT_SRC}
      size={size}
      ring={ring}
      status='away'
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A failed portrait resolves to named initials in the same circular frame, preserving the ring and presence indicator.',
      },
    },
  },
};

export const Sizes: Story = {
  render: () => (
    <div className='flex items-end gap-3'>
      {(['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const).map(size => (
        <Avatar key={size} size={size}>
          <AvatarFallback size={size}>{size}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
};

export const PresenceStates: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      {(['online', 'away', 'offline'] as const).map(status => (
        <div key={status} className='grid justify-items-center gap-2'>
          <UserAvatar name={status} size='lg' status={status} />
          <span className='text-xs text-tertiary-token'>{status}</span>
        </div>
      ))}
    </div>
  ),
};

export const Empty: Story = {
  render: () => <UserAvatar size='lg' />,
  parameters: {
    docs: {
      description: {
        story:
          'With no name and no image the circular frame keeps its size and shows a neutral “?” labelled “Avatar”.',
      },
    },
  },
};

export const ErrorState: Story = {
  render: () => (
    <UserAvatar name='Alex Chen' src={FAILED_PORTRAIT_SRC} size='lg' ring />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Undecodable portrait data triggers the image error handler and falls back to the named initials in the same circular frame.',
      },
    },
  },
};

export const Partial: Story = {
  render: () => <UserAvatar name='Maya Okafor' size='lg' status='online' />,
  parameters: {
    docs: {
      description: {
        story:
          'A name without an image renders initials, keeping presence and the circular person crop.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='flex w-48 items-center gap-2'>
      <UserAvatar
        name='Maximiliana Alejandra Konstantinopoulou-Vanderbilt Featuring The Orchestra'
        size='md'
      />
      <span className='min-w-0 truncate text-sm text-primary-token'>
        Maximiliana Alejandra Konstantinopoulou-Vanderbilt Featuring The
        Orchestra
      </span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A very long name still yields two initials in a fixed frame; the full name stays the accessible label.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' className='flex items-center gap-3'>
      <UserAvatar name='ليلى حداد' size='lg' status='away' />
      <UserAvatar name='ליאור כהן' size='lg' />
      <span className='text-sm text-primary-token'>ليلى حداد</span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Arabic and Hebrew names derive grapheme-safe initials in a right-to-left row; the presence dot keeps its bottom-right corner.',
      },
    },
  },
};
