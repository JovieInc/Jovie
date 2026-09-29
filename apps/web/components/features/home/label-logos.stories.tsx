import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NormalizedTrustLogo } from '@/components/media/NormalizedTrustLogo';
import { TRUST_LOGO_ASSETS } from '@/components/media/trustLogoAssets';
import { BlancoYNegroLogo, DiscoWaxLogo, RecPlayLogo } from './label-logos';

const meta = {
  title: 'Marketing/Sections/LabelLogos',
  component: NormalizedTrustLogo,
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
} satisfies Meta<typeof NormalizedTrustLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LogoBar: Story = {
  render: () => (
    <div className='flex flex-wrap items-center justify-center gap-x-10 gap-y-6 p-10 text-white/55'>
      {TRUST_LOGO_ASSETS.map(asset => (
        <div key={asset.id} className='w-32'>
          <NormalizedTrustLogo id={asset.id} />
        </div>
      ))}
      <DiscoWaxLogo />
      <BlancoYNegroLogo />
      <RecPlayLogo />
    </div>
  ),
};
