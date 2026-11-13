import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import {
  HomepageInviteClose,
  HomepageProfileChapter,
  HomepageReleasesChapter,
  HomepageStoryHero,
} from './HomepageEditorial';

/**
 * The editorial homepage (Tim, 2026-11-03; Tim, 2026-11-09 one front door):
 * the locked line, the jov.ie/you profile, the releases workspace, then the
 * claim entry.
 */
const meta = {
  title: 'Marketing/HomepageEditorial',
  component: HomepageStoryHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Homepage chapters. The hero action claims your handle at /start; product imagery comes from the screenshot registry.',
      },
    },
  },
} satisfies Meta<typeof HomepageStoryHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Hero: Story = {};

export const Profile: Story = {
  render: () => <HomepageProfileChapter />,
};

export const Releases: Story = {
  render: () => <HomepageReleasesChapter />,
};

export const ClaimClose: Story = {
  render: () => <HomepageInviteClose />,
};

/** getLiveContent uses these code defaults when published copy is unavailable. */
export const ErrorPublishedCopyUnavailable: Story = {
  render: () => <HomepageInviteClose copy={HOMEPAGE_EDITORIAL_COPY.invite} />,
  parameters: {
    docs: {
      description: {
        story:
          'The content-store error fallback keeps the default claim entry available. Store fallback behavior is covered in store.server.test.ts.',
      },
    },
  },
};

/**
 * Offline, this native form stays editable before navigation. The real
 * offline-browser case in marketing-headings-visual.spec.ts verifies that
 * environment; navigation failures belong to the browser and /start.
 */
export const OfflineClaimEntry: Story = {
  render: () => <HomepageInviteClose />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Your handle' });
    await userEvent.type(input, 'myhandle');
    await expect(input).toHaveValue('myhandle');
    await expect(input).toHaveFocus();
    await expect(
      canvas.getByRole('button', { name: 'Claim your handle' })
    ).toBeEnabled();
  },
};

/**
 * Long content: a published headline with no reviewed line breaks wraps
 * naturally, beside a body twice the approved length.
 */
export const LongContentProfileCopy: Story = {
  render: () => (
    <HomepageProfileChapter
      copy={{
        headline:
          'One name that every listener, promoter, label and playlist editor finds the same way, everywhere.',
        body: 'Your profile at jov.ie leads with what matters now: your latest release, your links, the shows you have coming up and a way for listeners to get updates. Every service, every release and every update stays in one place under the one name people already search for.',
      }}
    />
  ),
};

/** Right-to-left: translated hero lede and profile chapter in an Arabic document. */
export const RtlArabic: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <HomepageStoryHero
        headingId='home-hero-heading-rtl'
        copy={{
          ...HOMEPAGE_EDITORIAL_COPY.hero,
          subhead: 'ملفك، وكل إصدار، ورابط لكل منصة تُبث عليها موسيقاك.',
        }}
      />
      <HomepageProfileChapter
        copy={{
          headline: 'اسم واحد. في كل مكان.',
          body: 'ملفك على jov.ie يبدأ بما يهم الآن: أحدث إصدار، وروابطك، وطريقة ليتابعك المستمعون.',
        }}
      />
    </div>
  ),
};
