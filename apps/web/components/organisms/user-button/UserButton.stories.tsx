import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  createSignedInApiMock,
  withSignedInSession,
} from '@/.storybook/signed-in-session';
import { SidebarIdentityGroup } from '@/components/organisms/sidebar-identity-group';
import { APP_ROUTES } from '@/constants/routes';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import type { Artist } from '@/types/db';
import { UserButton } from './UserButton';

const meta: Meta<typeof UserButton> = {
  title: 'Organisms/UserButton',
  component: UserButton,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled', 'loading'],
    },
  },
  args: {
    showUserInfo: true,
    profileHref: APP_ROUTES.SETTINGS_PROFILE,
    settingsHref: APP_ROUTES.SETTINGS,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    showUserInfo: false,
  },
};

export const CollapsedDockStatus: Story = {
  args: {
    dockStatus: {
      label: "Update available · What's new",
      badges: <span aria-hidden='true'>↑ ·</span>,
    },
  },
};

const signedIn: NonNullable<Story['decorators']> = [
  withSignedInSession,
  Story => (
    <JovieAuthValuesProvider>
      <Story />
    </JovieAuthValuesProvider>
  ),
];

const LONG_NAME_ARTIST: Artist = {
  id: 'story-artist',
  owner_user_id: 'story-user',
  handle: 'timwhite',
  spotify_id: 'story-spotify',
  name: 'Tim White And The Extremely Long Touring Band Name',
  image_url: '',
  tagline: '',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00Z',
  settings: {},
};

/** No session yet: the row holds its skeleton until the session resolves. */
export const LoadingRow: Story = {};

const onSidebarRail: NonNullable<Story['decorators']> = [
  Story => (
    <div className='w-56 bg-sidebar p-2'>
      <Story />
    </div>
  ),
];

/** Loading row on the light rail: the skeleton reads against the surface. */
export const LoadingRowLight: Story = {
  parameters: { themes: { themeOverride: 'light' } },
  decorators: onSidebarRail,
};

/** Loading row on the dark rail. */
export const LoadingRowDark: Story = {
  parameters: { themes: { themeOverride: 'dark' } },
  decorators: onSidebarRail,
};

/** Signed in without a photo: the avatar falls back to initials. */
export const PartialWithoutAvatar: Story = {
  decorators: signedIn,
};

/** A long account name truncates inside the row. */
export const LongContent: Story = {
  args: { artist: LONG_NAME_ARTIST },
  decorators: [
    ...signedIn,
    Story => (
      <div className='w-56'>
        <Story />
      </div>
    ),
  ],
};

/** The signed-in row inside a right-to-left page. */
export const Rtl: Story = {
  decorators: [
    ...signedIn,
    Story => (
      <div dir='rtl' lang='ar' className='w-56'>
        <Story />
      </div>
    ),
  ],
};

const light = { themes: { themeOverride: 'light' } };
const dark = { themes: { themeOverride: 'dark' } };
const mobile = { viewport: { defaultViewport: 'mobile1' } };

/**
 * The account row as it sits at the foot of the open sidebar, inside the
 * identity group that owns its inset. Click it to open the menu.
 */
const sidebarRow: NonNullable<Story['decorators']> = [
  ...signedIn,
  Story => (
    <div
      data-account-menu-preview
      className='flex w-56 flex-col bg-sidebar py-2 text-primary-token'
    >
      <Story />
    </div>
  ),
];

/** One icon column, one label edge, even inset: row and menu together. */
export const AccountMenu: Story = {
  render: () => <SidebarIdentityGroup calm profileHref={undefined} />,
  decorators: sidebarRow,
  parameters: dark,
};
export const AccountMenuLight: Story = { ...AccountMenu, parameters: light };
export const AccountMenuMobile: Story = {
  ...AccountMenu,
  parameters: { ...dark, ...mobile },
};
export const AccountMenuMobileLight: Story = {
  ...AccountMenu,
  parameters: { ...light, ...mobile },
};

/** The loading row on the light sidebar surface (JOV-12383). */
export const LoadingRowLight: Story = {
  decorators: [
    Story => (
      <div className='w-56 bg-sidebar px-3 py-2'>
        <Story />
      </div>
    ),
  ],
  parameters: light,
};

/** Deterministic Mac menu data; the production UserButton owns every row. */
function setupMacMenu(noUsername = false) {
  const target = window as Window & {
    __jovieApiMock?: ReturnType<typeof createSignedInApiMock>;
  };
  const previous = target.__jovieApiMock;
  const previousRuntime = document.documentElement.dataset.desktopRuntime;
  const session = createSignedInApiMock(noUsername ? { username: '' } : {});
  document.documentElement.dataset.desktopRuntime = 'electron';
  target.__jovieApiMock = request => {
    switch (request.url.pathname) {
      case '/api/billing/status':
        return Response.json({
          isPro: true,
          plan: 'pro',
          stripeCustomerId: 'story-customer',
        });
      case '/api/mobile/v1/ios-access':
        return Response.json({ hasAccess: true, installUrl: null });
      case '/api/chat/usage':
        return Response.json({
          plan: 'pro',
          weeklyLimit: 100,
          used: 14,
          remaining: 86,
          resetAt: '2026-11-16T00:00:00Z',
          isExhausted: false,
          warningThreshold: 10,
          isNearLimit: false,
        });
      default:
        return session(request);
    }
  };
  return () => {
    target.__jovieApiMock = previous;
    if (previousRuntime === undefined)
      delete document.documentElement.dataset.desktopRuntime;
    else document.documentElement.dataset.desktopRuntime = previousRuntime;
  };
}

export const MacAccountMenu: Story = {
  args: { calm: true },
  beforeEach: () => setupMacMenu(),
  decorators: [
    Story => (
      <JovieAuthValuesProvider>
        <div className='flex min-h-screen items-end bg-sidebar p-2 text-primary-token'>
          <div className='w-52'>
            <Story />
          </div>
        </div>
      </JovieAuthValuesProvider>
    ),
  ],
  parameters: { ...dark, layout: 'fullscreen' },
};
export const MacAccountMenuLight: Story = {
  ...MacAccountMenu,
  parameters: { ...light, layout: 'fullscreen' },
};
export const MacAccountMenuLongName: Story = {
  ...MacAccountMenu,
  args: { calm: true, artist: LONG_NAME_ARTIST },
};
export const MacAccountMenuNoUsername: Story = {
  ...MacAccountMenu,
  beforeEach: () => setupMacMenu(true),
};

export const MacAccountMenuLongNameLight: Story = {
  ...MacAccountMenuLongName,
  parameters: { ...light, layout: 'fullscreen' },
};
export const MacAccountMenuNoUsernameLight: Story = {
  ...MacAccountMenuNoUsername,
  parameters: { ...light, layout: 'fullscreen' },
};
