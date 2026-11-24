import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DesktopQrOverlay } from './DesktopQrOverlay';

const longHandle =
  'verylongartistnamewithmanycharactersforoverflowandqrurlencodingchecks';
const rtlHandle = 'فنان-طويل-الاسم';

const meta = {
  title: 'Profile/DesktopQrOverlay',
  component: DesktopQrOverlay,
  args: {
    handle: 'testartist',
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DesktopQrOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const LongContentHandle: Story = {
  args: {
    handle: longHandle,
  },
};

export const RtlOverflowHandle: Story = {
  args: {
    handle: rtlHandle,
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
