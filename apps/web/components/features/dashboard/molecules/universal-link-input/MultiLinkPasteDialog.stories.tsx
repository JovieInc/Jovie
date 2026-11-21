import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { MultiLinkPasteDialog } from './MultiLinkPasteDialog';
import type { ExtractedLinkInfo } from './useMultiLinkPaste';

function info(
  url: string,
  overrides: Partial<Omit<ExtractedLinkInfo, 'detectedLink'>> = {}
): ExtractedLinkInfo {
  return {
    detectedLink: detectPlatform(url),
    isDuplicate: false,
    isSelected: true,
    ...overrides,
  };
}

const links: ExtractedLinkInfo[] = [
  info('https://open.spotify.com/artist/sashawaves'),
  info('https://www.instagram.com/sashawaves'),
  info('https://www.youtube.com/@sashawaves', { isDuplicate: true }),
];

const meta = {
  title: 'Dashboard/Molecules/UniversalLinkInput/MultiLinkPasteDialog',
  component: MultiLinkPasteDialog,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    onClose: () => {},
    onConfirm: () => {},
    onToggleSelection: () => {},
    extractedLinks: links,
    selectableCount: 2,
  },
} satisfies Meta<typeof MultiLinkPasteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyNothingSelectable: Story = {
  args: {
    extractedLinks: [
      info('https://www.instagram.com/sashawaves', { isDuplicate: true }),
      info('https://www.youtube.com/@sashawaves', { isDuplicate: true }),
    ],
    selectableCount: 0,
  },
};

export const LongContentUrls: Story = {
  args: {
    extractedLinks: [
      info(
        'https://open.spotify.com/artist/sashawaves?si=a-very-long-tracking-query-string-that-should-truncate-inside-the-row-without-wrapping'
      ),
      info(
        'https://www.instagram.com/the.extraordinarily.long.named.midnight.orchestra'
      ),
    ],
    selectableCount: 2,
  },
};

export const RtlUrls: Story = {
  args: {
    extractedLinks: [
      info('https://www.instagram.com/فرقة-منتصف-الليل'),
      info('https://open.spotify.com/artist/ar-band'),
    ],
    selectableCount: 2,
  },
};
