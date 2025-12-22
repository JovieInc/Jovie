import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SocialIcon } from './SocialIcon';

const meta: Meta<typeof SocialIcon> = {
  title: 'Atoms/SocialIcon',
  component: SocialIcon,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    platform: {
      control: { type: 'text' },
    },
    className: {
      control: { type: 'text' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Instagram: Story = {
  args: {
    platform: 'instagram',
    className: 'h-6 w-6',
  },
};

export const Twitter: Story = {
  args: {
    platform: 'twitter',
    className: 'h-6 w-6',
  },
};

export const Spotify: Story = {
  args: {
    platform: 'spotify',
    className: 'h-6 w-6',
  },
};

export const YouTube: Story = {
  args: {
    platform: 'youtube',
    className: 'h-6 w-6',
  },
};

export const TikTok: Story = {
  args: {
    platform: 'tiktok',
    className: 'h-6 w-6',
  },
};

export const AppleMusic: Story = {
  args: {
    platform: 'apple',
    className: 'h-6 w-6',
  },
};

export const SoundCloud: Story = {
  args: {
    platform: 'soundcloud',
    className: 'h-6 w-6',
  },
};

export const Venmo: Story = {
  args: {
    platform: 'venmo',
    className: 'h-6 w-6',
  },
};

export const UnknownPlatform: Story = {
  args: {
    platform: 'unknown-platform',
    className: 'h-6 w-6',
  },
};

export const AllPlatforms: Story = {
  render: () => (
    <div className='grid grid-cols-4 gap-4'>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon platform='instagram' className='h-8 w-8 text-pink-500' />
        <span className='text-xs'>Instagram</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon platform='twitter' className='h-8 w-8 text-blue-400' />
        <span className='text-xs'>Twitter/X</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon platform='spotify' className='h-8 w-8 text-green-500' />
        <span className='text-xs'>Spotify</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon platform='youtube' className='h-8 w-8 text-red-500' />
        <span className='text-xs'>YouTube</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon
          platform='tiktok'
          className='h-8 w-8 text-black dark:text-white'
        />
        <span className='text-xs'>TikTok</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon
          platform='apple'
          className='h-8 w-8 text-gray-800 dark:text-white'
        />
        <span className='text-xs'>Apple Music</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon platform='soundcloud' className='h-8 w-8 text-orange-500' />
        <span className='text-xs'>SoundCloud</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon platform='venmo' className='h-8 w-8 text-blue-600' />
        <span className='text-xs'>Venmo</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon platform='discord' className='h-8 w-8 text-indigo-500' />
        <span className='text-xs'>Discord</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon
          platform='github'
          className='h-8 w-8 text-gray-800 dark:text-white'
        />
        <span className='text-xs'>GitHub</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon platform='website' className='h-8 w-8 text-blue-600' />
        <span className='text-xs'>Website</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <SocialIcon platform='unknown' className='h-8 w-8 text-gray-500' />
        <span className='text-xs'>Unknown</span>
      </div>
    </div>
  ),
};

export const DifferentSizes: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <SocialIcon platform='spotify' className='h-4 w-4 text-green-500' />
      <SocialIcon platform='spotify' className='h-6 w-6 text-green-500' />
      <SocialIcon platform='spotify' className='h-8 w-8 text-green-500' />
      <SocialIcon platform='spotify' className='h-12 w-12 text-green-500' />
    </div>
  ),
};

export const SocialBar: Story = {
  render: () => (
    <div className='bg-gray-50 dark:bg-gray-900 p-6 rounded-lg'>
      <h3 className='text-lg font-semibold mb-4 text-center'>Follow @artist</h3>
      <div className='flex justify-center gap-4'>
        <a
          href='#'
          className='p-2 rounded-full bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow'
        >
          <SocialIcon platform='spotify' className='h-5 w-5 text-green-500' />
        </a>
        <a
          href='#'
          className='p-2 rounded-full bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow'
        >
          <SocialIcon
            platform='apple'
            className='h-5 w-5 text-gray-800 dark:text-white'
          />
        </a>
        <a
          href='#'
          className='p-2 rounded-full bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow'
        >
          <SocialIcon platform='instagram' className='h-5 w-5 text-pink-500' />
        </a>
        <a
          href='#'
          className='p-2 rounded-full bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow'
        >
          <SocialIcon
            platform='tiktok'
            className='h-5 w-5 text-black dark:text-white'
          />
        </a>
        <a
          href='#'
          className='p-2 rounded-full bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow'
        >
          <SocialIcon platform='youtube' className='h-5 w-5 text-red-500' />
        </a>
      </div>
    </div>
  ),
};
