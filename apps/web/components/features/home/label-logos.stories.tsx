import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ArmadaMusicLogo,
  AwalLogo,
  BlackHoleRecordingsLogo,
  BlancoYNegroLogo,
  DiscoWaxLogo,
  RecPlayLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

const meta = {
  title: 'Marketing/Sections/LabelLogos',
  component: BlackHoleRecordingsLogo,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'Record-label marks for the homepage and pricing trust logo bar. Vector marks render in currentColor; Black Hole Recordings is a committed PNG served without the image optimizer.',
      },
    },
  },
} satisfies Meta<typeof BlackHoleRecordingsLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LogoBar: Story = {
  render: () => (
    <div className='flex flex-wrap items-center justify-center gap-x-10 gap-y-6 p-10 text-white/55'>
      <UniversalMusicGroupLogo className='h-5 w-auto' />
      <ArmadaMusicLogo className='h-6 w-auto' />
      <AwalLogo className='h-6 w-auto' />
      <TheOrchardLogo className='h-6 w-auto' />
      <BlackHoleRecordingsLogo className='h-6 w-auto' />
      <DiscoWaxLogo />
      <BlancoYNegroLogo />
      <RecPlayLogo />
    </div>
  ),
};
