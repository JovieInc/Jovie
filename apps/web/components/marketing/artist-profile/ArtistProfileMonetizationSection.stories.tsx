import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileMonetizationSection } from './ArtistProfileMonetizationSection';

const meta = {
  title: 'Marketing/Source/ArtistProfileMonetizationSection',
  component: ArtistProfileMonetizationSection,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      // Internal MonetizationCard props are exercised through the canonical
      // monetization fixture rather than supplied to the section itself.
      uncoveredProps: ['cardId', 'textAnchor', 'visualSide'],
    },
    pen: {
      registryId: 'section.monetization',
      penRoot: 'F3grtS',
      sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1',
      fixture: 'ARTIST_PROFILE_COPY.monetization',
      body: 'four-card-earning-loop-carousel',
      routeMount: 'omitted-on-current-production-route',
      bindingStatus: 'registry-reclassification-owner-stacked',
    },
    docs: {
      description: {
        component:
          'Exact source-backed ArtistProfileMonetizationSection body: a deterministic four-card earning-loop carousel. The current route omits this body, and replacing the registry take-rate exemplar with this source-truthful contract remains an owner-stacked registry change.',
      },
    },
  },
  args: {
    monetization: ARTIST_PROFILE_COPY.monetization,
  },
} satisfies Meta<typeof ArtistProfileMonetizationSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SectionMonetization: Story = {};

/** Long content: a long subhead and a long first-card title and body wrap inside the carousel. */
export const LongContentCopy: Story = {
  args: {
    monetization: {
      ...ARTIST_PROFILE_COPY.monetization,
      subhead:
        'Turn a ten dollar busking tip into a lifelong customer, a repeat ticket buyer and a fan who shows up to every release party for years to come.',
      irlPaymentsCard: {
        ...ARTIST_PROFILE_COPY.monetization.irlPaymentsCard,
        title:
          'Accept payments anywhere you perform, from the sidewalk to the festival main stage',
        body: 'A sidewalk scan should feel instant, native, and ready to close the tip, with no app to install, no account to create and no card reader to carry or charge between sets.',
      },
    },
  },
};

/** Rtl: the carousel mirrors for a right-to-left reader. */
export const RtlLayout: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
