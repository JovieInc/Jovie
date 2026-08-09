import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import PublicProfileNotFound from '@/app/[username]/not-found';

const SOURCE_SHA = '12224180f432e72653646f5588a5e320a92b493e';
const SOURCE_PATH = 'apps/web/app/[username]/not-found.tsx';

const meta = {
  title: 'Public/Routes/PublicProfileNotFound',
  component: PublicProfileNotFound,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The exact profile-miss boundary inherited by public profile child routes. Each receipt proves only the shipped missing state. Successful profile, contact, merch, payment, and shop states remain server-owned; the notifications route is excluded because it is redirect-only.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PublicProfileNotFound>;

export default meta;
type Story = StoryObj<typeof meta>;

function missingProfileStory(
  name: string,
  registryId: string,
  route: string,
  storyExport: string
): Story {
  return {
    name,
    parameters: {
      pen: {
        registryId,
        route,
        source: SOURCE_PATH,
        sourceExport: 'default',
        storyExport,
        sourceSha: SOURCE_SHA,
        fixtureState: 'missing',
        proofTier: 'source-backed-missing-state',
      },
    },
  };
}

export const Web044MissingProfileAlias = missingProfileStory(
  'web-044 /[username]/[...slug] missing',
  'web-044-[username]--[---slug]',
  '/[username]/[...slug]',
  'Web044MissingProfileAlias'
);

export const Web049MissingProfileAbout = missingProfileStory(
  'web-049 /[username]/about missing',
  'web-049-[username]--about',
  '/[username]/about',
  'Web049MissingProfileAbout'
);

export const Web050MissingProfileAlerts = missingProfileStory(
  'web-050 /[username]/alerts missing',
  'web-050-[username]--alerts',
  '/[username]/alerts',
  'Web050MissingProfileAlerts'
);

export const Web051MissingProfileContact = missingProfileStory(
  'web-051 /[username]/contact missing',
  'web-051-[username]--contact',
  '/[username]/contact',
  'Web051MissingProfileContact'
);

export const Web052MissingMerchCard = missingProfileStory(
  'web-052 /[username]/merch/[cardId] missing',
  'web-052-[username]--merch--[cardId]',
  '/[username]/merch/[cardId]',
  'Web052MissingMerchCard'
);

export const Web054MissingPublicProfile = missingProfileStory(
  'web-054 /[username] missing',
  'web-054-[username]',
  '/[username]',
  'Web054MissingPublicProfile'
);

export const Web055MissingProfilePay = missingProfileStory(
  'web-055 /[username]/pay missing',
  'web-055-[username]--pay',
  '/[username]/pay',
  'Web055MissingProfilePay'
);

export const Web056MissingProfileModeRender = missingProfileStory(
  'web-056 /[username]/profile-mode-render/[profileMode]/[marker] missing',
  'web-056-[username]--profile-mode-render--[profileMode]--[marker]',
  '/[username]/profile-mode-render/[profileMode]/[marker]',
  'Web056MissingProfileModeRender'
);

export const Web057MissingProfileShop = missingProfileStory(
  'web-057 /[username]/shop missing',
  'web-057-[username]--shop',
  '/[username]/shop',
  'Web057MissingProfileShop'
);
