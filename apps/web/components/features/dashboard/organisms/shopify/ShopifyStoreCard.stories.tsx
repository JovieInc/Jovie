import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import {
  DASHBOARD_FIXTURE_PROFILE,
  DashboardStoryProviders,
  DEFAULT_DASHBOARD_DATA,
} from '@/.storybook/dashboard-fixtures';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { ShopifyStoreCard, ShopifyStoreCardSkeleton } from './ShopifyStoreCard';

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;

type ApiWindow = Window & { __jovieApiMock?: ApiMock };

/**
 * Installs a per-story handler for /api/dashboard/shop before the card mounts
 * (its fetch runs in a mount effect, ahead of any decorator effect).
 */
function mockShopApi(handler: (init?: RequestInit) => Promise<Response>) {
  return () => {
    const apiWindow = window as ApiWindow;
    const previous = apiWindow.__jovieApiMock;
    apiWindow.__jovieApiMock = ({ url, init }) =>
      url.pathname === '/api/dashboard/shop'
        ? handler(init)
        : previous?.({ url, init });
    return () => {
      apiWindow.__jovieApiMock = previous;
    };
  };
}

const savedStore = (init?: RequestInit) =>
  Promise.resolve(
    init?.method === 'PUT'
      ? Response.json({ ok: true })
      : Response.json({ shopifyUrl: 'https://sasha-waves.myshopify.com' })
  );

const withUsername: DashboardData = {
  ...DEFAULT_DASHBOARD_DATA,
  selectedProfile: {
    ...DASHBOARD_FIXTURE_PROFILE,
    username: 'sashawaves',
  } as DashboardData['selectedProfile'],
};

const meta = {
  title: 'Features/Dashboard/Organisms/Shopify/ShopifyStoreCard',
  component: ShopifyStoreCard,
  parameters: { layout: 'padded' },
  decorators: [
    function ShopDashboardProviders(Story) {
      return (
        <DashboardStoryProviders dashboardData={withUsername}>
          <div className='max-w-xl'>
            <Story />
          </div>
        </DashboardStoryProviders>
      );
    },
  ],
} satisfies Meta<typeof ShopifyStoreCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A connected store with the preview link to the public shop page. */
export const Connected: Story = {
  beforeEach: mockShopApi(savedStore),
};

/** Loading: the saved setting has not come back yet, so the skeleton holds the space. */
export const LoadingSetting: Story = {
  render: function LoadingSkeleton() {
    return <ShopifyStoreCardSkeleton />;
  },
};

/** Empty: no store is linked yet. */
export const EmptyNoStore: Story = {
  beforeEach: mockShopApi(() => Promise.resolve(Response.json({}))),
};

/** Error: a URL outside myshopify.com is refused before saving. */
export const ErrorInvalidDomain: Story = {
  beforeEach: mockShopApi(() => Promise.resolve(Response.json({}))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText('Store URL'),
      'https://example.com/shop'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
  },
};

/** Long content: a long store domain and a long server error message. */
export const LongContentServerError: Story = {
  beforeEach: mockShopApi(init =>
    Promise.resolve(
      init?.method === 'PUT'
        ? Response.json(
            {
              error:
                'This Shopify store could not be verified. Check that the store is published, that the domain is spelled exactly as it appears in your Shopify admin, and try again.',
            },
            { status: 422 }
          )
        : Response.json({})
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText('Store URL'),
      'https://sasha-waves-official-merch-and-limited-vinyl-pressings.myshopify.com'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
  },
};

/** Offline: the save fails at the network and the card asks to try again. */
export const OfflineSaveFailed: Story = {
  beforeEach: mockShopApi(init =>
    init?.method === 'PUT'
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve(Response.json({}))
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText('Store URL'),
      'https://sasha-waves.myshopify.com'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
  },
};

/**
 * Partial: a store is saved but the profile has no username yet, so the
 * preview link to the public shop page is left out.
 */
export const PartialNoUsername: Story = {
  beforeEach: mockShopApi(savedStore),
  decorators: [
    function ProfileWithoutUsername(Story) {
      return (
        <DashboardStoryProviders>
          <Story />
        </DashboardStoryProviders>
      );
    },
  ],
};

/** Right-to-left: the connected card in an Arabic document direction. */
export const RtlArabicDocument: Story = {
  beforeEach: mockShopApi(savedStore),
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
