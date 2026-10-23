import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  primaryProviderKeys,
  providerConfig,
} from '@/app/app/(shell)/dashboard/releases/config';
import { DemoAuthShell } from '@/components/features/demo/DemoAuthShell';
import { createDemoReleaseExperienceAdapter } from '@/components/features/demo/demo-release-experience-adapter';
import {
  DEMO_RELEASE_SIDEBAR_FIXTURES,
  DEMO_RELEASE_VIEW_MODELS,
} from '@/components/features/demo/mock-release-data';
import { ReleaseProviderMatrix } from './ReleaseProviderMatrix';

const meta = {
  title: 'Dashboard/Releases/ReleaseProviderMatrix',
  component: ReleaseProviderMatrix,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) => (
      <DemoAuthShell releasesForQuery={context.args.releases}>
        <Story />
      </DemoAuthShell>
    ),
  ],
  args: {
    releases: DEMO_RELEASE_VIEW_MODELS,
    providerConfig,
    primaryProviders: primaryProviderKeys,
    spotifyConnected: true,
    spotifyArtistName: 'Demo Artist',
    experienceAdapter: createDemoReleaseExperienceAdapter({
      releases: DEMO_RELEASE_VIEW_MODELS,
      sidebarDataByReleaseId: DEMO_RELEASE_SIDEBAR_FIXTURES,
    }),
  },
} satisfies Meta<typeof ReleaseProviderMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dense: Story = {};

export const Empty: Story = {
  args: {
    releases: [],
    experienceAdapter: createDemoReleaseExperienceAdapter({
      releases: [],
      sidebarDataByReleaseId: {},
    }),
  },
};

export const Importing: Story = {
  args: {
    ...Empty.args,
    initialImporting: true,
    initialTotalCount: DEMO_RELEASE_VIEW_MODELS.length,
  },
};
