import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { InviteCampaignManager } from './InviteCampaignManager';
import {
  buildInvite,
  buildPreview,
  type CampaignRoutes,
  inviteList,
  json,
  never,
  offline,
  routeCampaignRequest,
} from './inviteCampaign.test-fixtures';

/**
 * The manager's props default to `{}`, so its story args include undefined;
 * take the decorator type from its own Meta rather than the generic one.
 */
type CampaignDecorator = Extract<
  NonNullable<Meta<typeof InviteCampaignManager>['decorators']>,
  readonly unknown[]
>[number];

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;

/**
 * Drives the live campaign queries through the Storybook /api fetch hook.
 * The mock is registered before the first fetch and removed on unmount; a
 * fresh client keeps each story's reads isolated.
 */
function CampaignApiFixture({
  routes,
  children,
}: Readonly<{ routes: CampaignRoutes; children: ReactNode }>) {
  const [{ client, restore }] = useState(() => {
    const apiWindow = window as Window & { __jovieApiMock?: ApiMock };
    const previous = apiWindow.__jovieApiMock;
    apiWindow.__jovieApiMock = request =>
      routeCampaignRequest(routes, request.url, request.init) ??
      previous?.(request);
    return {
      client: new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
      restore: () => {
        apiWindow.__jovieApiMock = previous;
      },
    };
  });
  useEffect(() => restore, [restore]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function withCampaignApi(routes: CampaignRoutes): CampaignDecorator {
  return function CampaignApiDecorator(Story) {
    return (
      <CampaignApiFixture routes={routes}>
        <Story />
      </CampaignApiFixture>
    );
  };
}

const withRtlDirection: CampaignDecorator = function RtlDirectionDecorator(
  Story
) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const LONG_HANDLE = 'the-extraordinarily-long-collective-handle-for-overflow';

const meta = {
  title: 'Features/Admin/Campaigns/InviteCampaignManager States',
  component: InviteCampaignManager,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof InviteCampaignManager>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: none of the campaign reads have answered yet. */
export const Loading: Story = {
  decorators: [
    withCampaignApi({
      settings: never,
      preview: never,
      stats: never,
      overview: never,
      invites: never,
    }),
  ],
};

/** Empty: no invite activity yet and nobody in the batch has an email. */
export const Empty: Story = {
  decorators: [
    withCampaignApi({
      preview: json(buildPreview(0, 5, [])),
      invites: json(inviteList([])),
    }),
  ],
};

/** Error: the batch preview read failed on the server. */
export const ErrorPreviewFailed: Story = {
  decorators: [withCampaignApi({ preview: json({ error: 'boom' }, 500) })],
};

/** Partial: the funnel read failed and most of the batch lacks an email. */
export const PartialMissingEmails: Story = {
  decorators: [
    withCampaignApi({
      preview: json(buildPreview(3, 7)),
      overview: json({ error: 'boom' }, 500),
    }),
  ],
};

/** Long handles and emails must stay inside their table cells. */
export const LongContent: Story = {
  decorators: [
    withCampaignApi({
      invites: json(inviteList([buildInvite('long', LONG_HANDLE)])),
      preview: json(
        buildPreview(1, 0, [
          {
            id: 'long',
            username: LONG_HANDLE,
            displayName: null,
            fitScore: 91,
            email: `${LONG_HANDLE}@an-unusually-long-label-domain.example.com`,
          },
        ])
      ),
    }),
  ],
};

/** Offline: every campaign request fails before reaching the network. */
export const Offline: Story = {
  decorators: [
    withCampaignApi({
      settings: offline,
      preview: offline,
      stats: offline,
      overview: offline,
      invites: offline,
    }),
  ],
};

/** Permission denied: the preview read is refused for a non-admin session. */
export const PermissionDenied: Story = {
  decorators: [
    withCampaignApi({
      preview: json({ error: 'Admin access required' }, 403),
    }),
  ],
};

/** Right-to-left document with the default campaign data. */
export const Rtl: Story = {
  decorators: [withRtlDirection, withCampaignApi({})],
};
