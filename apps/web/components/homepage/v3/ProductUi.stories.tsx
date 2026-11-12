import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AppWindow, CatalogPlate, ReleaseInspector } from './ProductUi';
import './stage.css';
import './product-ui.css';

function Frame(Story: () => ReactNode) {
  return (
    <div
      className='hv3'
      style={{ position: 'relative', width: 1248, height: 584 }}
    >
      <Story />
    </div>
  );
}

/** Live HTML mirrors of Jovie for Mac (Pen JeTmo) used on the homepage. */
const meta = {
  title: 'Marketing/Homepage v3/ProductUi',
  component: AppWindow,
  decorators: [Frame],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
} satisfies Meta<typeof AppWindow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Releases: Story = {};

export const Inspector: Story = {
  render: () => (
    <div className='hv3-lift' style={{ width: 400, height: 464 }}>
      <ReleaseInspector anchor='story-upc' />
    </div>
  ),
};

export const Catalog: Story = {
  render: () => (
    <div className='hv3-plate' style={{ transform: 'none', top: 0 }}>
      <CatalogPlate />
    </div>
  ),
};

/** Right-to-left: the Releases window inside an RTL document. */
export const RtlReleases: Story = {
  render: () => (
    <div dir='rtl'>
      <AppWindow />
    </div>
  ),
};
