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
      sourceSha: 'e21d2e01bc80d7e0146a071207c406e1cd762bd3',
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
