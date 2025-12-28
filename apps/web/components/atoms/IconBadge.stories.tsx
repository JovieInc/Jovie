import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IconBadge } from './IconBadge';

// Mock icons for stories
const HeartIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    fill='currentColor'
    viewBox='0 0 24 24'
    xmlns='http://www.w3.org/2000/svg'
    aria-hidden='true'
  >
    <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
  </svg>
);

const StarIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    fill='currentColor'
    viewBox='0 0 24 24'
    xmlns='http://www.w3.org/2000/svg'
    aria-hidden='true'
  >
    <path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
  </svg>
);

const BellIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    fill='currentColor'
    viewBox='0 0 24 24'
    xmlns='http://www.w3.org/2000/svg'
    aria-hidden='true'
  >
    <path d='M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z' />
  </svg>
);

const CheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    fill='currentColor'
    viewBox='0 0 24 24'
    xmlns='http://www.w3.org/2000/svg'
    aria-hidden='true'
  >
    <path d='M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z' />
  </svg>
);

const WarningIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    fill='currentColor'
    viewBox='0 0 24 24'
    xmlns='http://www.w3.org/2000/svg'
    aria-hidden='true'
  >
    <path d='M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z' />
  </svg>
);

const meta: Meta<typeof IconBadge> = {
  title: 'Atoms/IconBadge',
  component: IconBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    colorVar: {
      control: { type: 'text' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    Icon: HeartIcon,
    colorVar: '--color-red-500',
  },
};

export const BlueHeart: Story = {
  args: {
    Icon: HeartIcon,
    colorVar: '--color-blue-500',
  },
};

export const GreenCheck: Story = {
  args: {
    Icon: CheckIcon,
    colorVar: '--color-green-500',
  },
};

export const YellowStar: Story = {
  args: {
    Icon: StarIcon,
    colorVar: '--color-yellow-500',
  },
};

export const PurpleBell: Story = {
  args: {
    Icon: BellIcon,
    colorVar: '--color-purple-500',
  },
};

export const RedWarning: Story = {
  args: {
    Icon: WarningIcon,
    colorVar: '--color-red-500',
  },
};

export const AllIcons: Story = {
  render: () => (
    <div className='flex gap-4'>
      <IconBadge Icon={HeartIcon} colorVar='--color-red-500' />
      <IconBadge Icon={StarIcon} colorVar='--color-yellow-500' />
      <IconBadge Icon={BellIcon} colorVar='--color-purple-500' />
      <IconBadge Icon={CheckIcon} colorVar='--color-green-500' />
      <IconBadge Icon={WarningIcon} colorVar='--color-orange-500' />
    </div>
  ),
};

export const CustomColors: Story = {
  render: () => (
    <div className='flex gap-4'>
      <IconBadge Icon={HeartIcon} colorVar='--color-pink-500' />
      <IconBadge Icon={StarIcon} colorVar='--color-indigo-500' />
      <IconBadge Icon={BellIcon} colorVar='--color-teal-500' />
      <IconBadge Icon={CheckIcon} colorVar='--color-emerald-500' />
    </div>
  ),
};
