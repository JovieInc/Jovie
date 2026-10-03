import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TRUST_LOGO_ASSETS } from './trustLogoAssets';

function TrustLogoAssetsDemo() {
  return (
    <div className='flex flex-wrap items-center gap-6 text-secondary-token'>
      {TRUST_LOGO_ASSETS.map(asset => {
        const Logo = asset.component;
        return (
          <div key={asset.id} className='flex flex-col items-center gap-2'>
            <Logo className='h-6 w-auto' />
            <span className='text-2xs'>{asset.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const meta = {
  title: 'Media/TrustLogoAssets',
  component: TrustLogoAssetsDemo,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TrustLogoAssetsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllLogos: Story = {};
