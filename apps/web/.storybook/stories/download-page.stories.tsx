import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import DownloadPage from '@/app/(marketing)/download/page';
import '../../app/(home)/home.css';

const meta = {
  title: 'Marketing/Pages/Download',
  component: DownloadPage,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1440] },
  },
  decorators: [
    Story => (
      <div className='system-b-marketing'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DownloadPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
