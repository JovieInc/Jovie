import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BrandLogo } from './BrandLogo';
import { Logo } from './Logo';
import { LogoLink } from './LogoLink';

const meta = {
  title: 'Atoms/BrandIdentity',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BrandLogoSource: Story = {
  name: 'BrandLogo',
  render: () => <BrandLogo />,
};

export const LogoSource: Story = {
  name: 'Logo',
  render: () => <Logo />,
};

export const LogoLinkSource: Story = {
  name: 'LogoLink',
  render: () => <LogoLink />,
};
