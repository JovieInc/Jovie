import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import type { AlgorithmHealthReport } from '@/lib/spotify/scoring';
import { AlgorithmHealthPanel } from './AlgorithmHealthPanel';
import {
  algorithmHealthProfile,
  contactWithoutSpotify,
  contactWithSpotify,
  emptyReport,
  longContentReport,
  partialReport,
  rtlReport,
} from './algorithmHealth.test-fixtures';

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;

type Respond = () => Promise<Response>;

/**
 * Drives the live algorithm-health query through the Storybook /api fetch
 * hook. The mock is registered before the first fetch and removed on
 * unmount; a fresh client keeps each story's read isolated.
 */
function AlgorithmHealthReadFixture({
  respond,
  children,
}: Readonly<{ respond: Respond; children: ReactNode }>) {
  const [{ client, restore }] = useState(() => {
    const apiWindow = window as Window & { __jovieApiMock?: ApiMock };
    const previous = apiWindow.__jovieApiMock;
    apiWindow.__jovieApiMock = request =>
      request.url.pathname === '/api/spotify/fal-analysis'
        ? respond()
        : previous?.(request);
    return {
      client: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
      restore: () => {
        apiWindow.__jovieApiMock = previous;
      },
    };
  });
  useEffect(() => restore, [restore]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function withAnalysis(respond: Respond): Decorator {
  return function AlgorithmHealthReadDecorator(Story) {
    return (
      <AlgorithmHealthReadFixture respond={respond}>
        <Story />
      </AlgorithmHealthReadFixture>
    );
  };
}

function reportResponse(report: AlgorithmHealthReport): Respond {
  return async () => Response.json(report);
}

const withDrawerWidth: Decorator = function DrawerWidthDecorator(Story) {
  return (
    <div className='w-full max-w-md p-4'>
      <Story />
    </div>
  );
};

const withRtlDirection: Decorator = function RtlDirectionDecorator(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Admin/AlgorithmHealthPanel States',
  component: AlgorithmHealthPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [withDrawerWidth],
  args: {
    profile: algorithmHealthProfile,
    contact: contactWithSpotify,
    isActive: true,
  },
} satisfies Meta<typeof AlgorithmHealthPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the Spotify analysis has not answered yet. */
export const LoadingAnalysis: Story = {
  decorators: [withAnalysis(() => new Promise<Response>(() => {}))],
};

/** Empty: the creator has no Spotify artist link, so no analysis runs. */
export const EmptyNoSpotifyLink: Story = {
  args: { contact: contactWithoutSpotify },
  decorators: [withAnalysis(reportResponse(emptyReport))],
};

/** Empty: Spotify returned no usable comparable artists. */
export const EmptyNoComparableArtists: Story = {
  decorators: [withAnalysis(reportResponse(emptyReport))],
};

/** Error: the analysis route answered with a server error. */
export const ErrorAnalysisFailed: Story = {
  decorators: [
    withAnalysis(async () =>
      Response.json({ error: 'Analysis failed' }, { status: 500 })
    ),
  ],
};

/** Partial: only some related artists resolved, with a warning. */
export const PartialResolvedArtists: Story = {
  decorators: [withAnalysis(reportResponse(partialReport))],
};

/** Long artist names and warnings must wrap or truncate cleanly. */
export const LongContent: Story = {
  decorators: [withAnalysis(reportResponse(longContentReport))],
};

/** Offline: the analysis request never reaches the network. */
export const OfflineNetworkFailure: Story = {
  decorators: [
    withAnalysis(() => Promise.reject(new TypeError('Failed to fetch'))),
  ],
};

/** Right-to-left document with Arabic and Hebrew artist names. */
export const Rtl: Story = {
  decorators: [withRtlDirection, withAnalysis(reportResponse(rtlReport))],
};
