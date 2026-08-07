import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerLinkSection } from './DrawerLinkSection';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

const meta = {
  title: 'Molecules/Drawer/DrawerLinkSection',
  component: DrawerLinkSection,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'DSP Links',
    onAdd: () => undefined,
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DrawerLinkSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    isEmpty: true,
    emptyMessage: 'No links yet.',
    emptyStateTestId: 'dsp-links-empty',
    children: null,
  },
};

export const WithLinks: Story = {
  args: {
    children: (
      <div className='space-y-1.5'>
        {['Spotify', 'Apple Music'].map(label => (
          <DrawerSurfaceCard key={label} className='px-3 py-2'>
            <p className='text-xs text-primary-token'>{label}</p>
          </DrawerSurfaceCard>
        ))}
      </div>
    ),
  },
};
