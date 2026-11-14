import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { FileAttachmentChip } from './FileAttachmentChip';

const meta = {
  title: 'Jovie/FileAttachmentChip',
  component: FileAttachmentChip,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    url: 'https://files.example.com/uploads/press-kit.pdf',
    name: 'press-kit.pdf',
    mediaType: 'application/pdf',
  },
} satisfies Meta<typeof FileAttachmentChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A named PDF in the user bubble opens in a new tab. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', {
      name: 'File attachment: press-kit.pdf',
    });
    await expect(link).toHaveAttribute('target', '_blank');
  },
};

/** On dark: the same chip on an assistant-side dark surface. */
export const OnDarkTone: Story = {
  args: {
    tone: 'onDark',
    url: 'https://files.example.com/uploads/stems.zip',
    name: 'stems.zip',
    mediaType: 'application/zip',
  },
};

/**
 * Partial: the upload carried no name or media type, so the label comes from
 * the URL path and the kind from its extension.
 */
export const PartialUrlOnly: Story = {
  args: {
    url: 'https://files.example.com/uploads/Midnight%20Drive%20master.wav?sig=abc',
    name: undefined,
    mediaType: undefined,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', {
        name: 'File attachment: Midnight Drive master.wav',
      })
    ).toBeVisible();
  },
};

/** Long content: a long file name is middle-ellipsized to keep its extension. */
export const LongContentFileName: Story = {
  args: {
    url: 'https://files.example.com/uploads/brief.docx',
    name: 'Midnight Drive deluxe anniversary edition marketing brief final v12.docx',
    mediaType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
};

/** Right-to-left: an Arabic file name inside an RTL bubble. */
export const RtlArabicFileName: Story = {
  args: {
    url: 'https://files.example.com/uploads/lyrics.txt',
    name: 'كلمات الأغنية الجديدة.txt',
    mediaType: 'text/plain',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
