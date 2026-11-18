import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QRCodeCard } from './QRCodeCard';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='w-56'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta: Meta<typeof QRCodeCard> = {
  title: 'Molecules/QRCodeCard States',
  component: QRCodeCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    data: 'https://jov.ie/taylorswift',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the default title with no description line. */
export const PartialTitleOnly: Story = {};

/** Long content: a long title and description wrap under the code. */
export const LongContentWrappedCopy: Story = {
  args: {
    title: 'Scan to open this artist profile on your phone and follow along',
    description:
      'Point your camera at the code to open the profile, listen on your preferred streaming service, pre-save the next release and turn on notifications for new drops.',
  },
  decorators: [CanvasFrame],
};

/** Right-to-left: Arabic copy under the code inside an RTL document. */
export const RtlArabicCopy: Story = {
  args: {
    title: 'امسح رمز الاستجابة السريعة',
    description: 'امسح الرمز بهاتفك لعرض الملف الشخصي',
  },
  decorators: [RtlFrame],
};
