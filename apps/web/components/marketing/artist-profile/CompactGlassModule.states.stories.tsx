import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { MarketingPageShell } from '../MarketingPageShell';
import { CompactGlassModule } from './CompactGlassModule';
import { CaptureActionPill } from './captureShared';

const meta = {
  title: 'Marketing/ArtistProfile/CompactGlassModule States',
  component: CompactGlassModule,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    function WithMarketingShell(Story) {
      return (
        <MarketingPageShell className='min-h-screen bg-page'>
          <div className='mx-auto flex w-full max-w-96 flex-col px-6 py-16'>
            <Story />
          </div>
        </MarketingPageShell>
      );
    },
  ],
  args: { children: null },
} satisfies Meta<typeof CompactGlassModule>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no label, so only the wrapped content shows in the material. */
export const PartialUnlabeled: Story = {
  args: {
    children: (
      <p className='text-sm text-secondary-token'>
        {ARTIST_PROFILE_COPY.capture.action.detail}
      </p>
    ),
  },
};

/** Long content: a label and body long enough to wrap inside the module. */
export const LongContentLabel: Story = {
  args: {
    label: ARTIST_PROFILE_COPY.capture.subhead,
    children: (
      <p className='text-sm text-secondary-token'>
        {`${ARTIST_PROFILE_COPY.capture.body} ${ARTIST_PROFILE_COPY.capture.body}`}
      </p>
    ),
  },
};

/** Right-to-left: an Arabic label and pill in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    label: 'تحديثات المعجبين',
    children: (
      <CaptureActionPill
        capture={{
          ...ARTIST_PROFILE_COPY.capture,
          action: {
            ...ARTIST_PROFILE_COPY.capture.action,
            confirmedLabel: 'تم الاشتراك',
          },
        }}
        phase='done'
      />
    ),
  },
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
