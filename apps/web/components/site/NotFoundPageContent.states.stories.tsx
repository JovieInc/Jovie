import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NotFoundPageContent } from './NotFoundPageContent';

const meta = {
  title: 'Site/NotFoundPageContent States',
  component: NotFoundPageContent,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function WithPageSurface(Story) {
      return (
        <div className='min-h-80 bg-base p-8 text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
  args: { variant: 'profile-miss', surface: 'profile' },
} satisfies Meta<typeof NotFoundPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the profile miss and its two actions in an Arabic document. */
export const RtlProfileMiss: Story = {
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: the root 404 in an Arabic document. */
export const RtlGenericRoot: Story = {
  args: { variant: 'generic', surface: 'root' },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
