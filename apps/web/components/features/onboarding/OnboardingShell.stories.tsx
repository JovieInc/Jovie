import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { OnboardingShell } from './OnboardingShell';

const meta = {
  title: 'Features/Onboarding/OnboardingShell',
  component: OnboardingShell,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1024] },
    docs: {
      description: {
        component:
          'The /start entry shell before and after authentication. A verified account keeps the chat but no longer sees a Sign in link.',
      },
    },
  },
  args: {
    sessionLabel: 'story',
    isSignedIn: false,
  },
} satisfies Meta<typeof OnboardingShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visitor: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Sign in' })).toBeVisible();
  },
};

export const SignedIn: Story = {
  args: { isSignedIn: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link', { name: 'Sign in' })).toBeNull();
  },
};

/** Presentation fixture: real shell, review card, phone, and auth controls.
 * The browser test blocks every write; this is not an ownership receipt. */
export const ProfileBeforeAuth: Story = {
  decorators: [
    Story => (
      <JovieAuthValuesProvider>
        <Story />
      </JovieAuthValuesProvider>
    ),
  ],
  args: {
    turnstileTestMode: true,
    entryProfile: {
      status: 'claimable',
      handle: 'fixtureartist',
      displayName: 'Fixture Artist',
      avatarUrl: new URL(
        '../../../public/images/avatars/nova-lane.jpg',
        import.meta.url
      ).href,
      spotifyId: 'fixtureartist',
      spotifyUrl: 'https://open.spotify.com/artist/fixtureartist',
      genres: ['house'],
      socialLinks: ['https://instagram.com/fixtureartist'],
      linkPlatforms: ['instagram'],
      linkCount: 1,
      latestRelease: {
        title: 'Fixture release',
        slug: 'fixture-release',
        artworkUrl: new URL(
          '../../../public/images/demo/artwork-1.png',
          import.meta.url
        ).href,
        releaseDate: '2026-10-20',
        releaseType: 'single',
      },
    },
    initialMessages: [
      {
        id: 'review-fixture',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'proposeNextStep',
            toolCallId: 'review-fixture',
            state: 'output-available',
            input: {},
            output: {
              action: 'propose_next_step',
              decision: {
                kind: 'instant_access',
                rationale: 'Fixture only',
                score: 85,
              },
            },
          },
        ],
      },
    ],
  },
};
