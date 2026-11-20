import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { OnboardingCompleteStep } from './OnboardingCompleteStep';

const withStepFrame: Decorator = Story => (
  <div className='h-screen w-full bg-base p-6'>
    <Story />
  </div>
);

const withRtlStepFrame: Decorator = Story => (
  <div dir='rtl' className='h-screen w-full bg-base p-6'>
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/Organisms/Onboarding/OnboardingCompleteStep States',
  component: OnboardingCompleteStep,
  parameters: { layout: 'fullscreen' },
  args: {
    title: "You're live.",
    prompt: 'Your profile is published and ready to share.',
    displayDomain: 'jov.ie',
    handle: 'sashawaves',
    copied: false,
    onGoToDashboard: fn(),
    onCopyLink: fn(),
    spotifyImportStatus: 'idle',
    spotifyImportStage: 0,
    spotifyImportMessage: '',
  },
} satisfies Meta<typeof OnboardingCompleteStep>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no prompt and no import running, so the progress card stays hidden. */
export const EmptyNoImportProgress: Story = {
  args: { prompt: undefined },
  decorators: [withStepFrame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Go to Dashboard' })
    ).toBeEnabled();
    await expect(canvas.queryByText('Link copied to clipboard!')).toBeNull();
  },
};

/** Error: the Spotify import failed; the dashboard button stays usable. */
export const ErrorSpotifyImportFailed: Story = {
  args: {
    spotifyImportStatus: 'error',
    spotifyImportStage: 1,
    spotifyImportMessage:
      'We could not import your releases. You can retry from the dashboard.',
  },
  decorators: [withStepFrame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        'We could not import your releases. You can retry from the dashboard.'
      )
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Go to Dashboard' })
    ).toBeEnabled();
  },
};

/** Long content: a long title, prompt, handle and import message all wrap. */
export const LongContentHandleAndMessage: Story = {
  args: {
    title: 'Your artist profile is published and ready for every fan to find',
    prompt:
      'Share the link anywhere you promote your music. This deliberately long prompt runs over several lines to check wrapping in the narrow column.',
    handle: 'the-extraordinarily-long-artist-handle-for-wrapping-checks',
    copied: true,
    spotifyImportStatus: 'importing',
    spotifyImportStage: 2,
    spotifyImportMessage:
      'Importing every release, track, collaborator credit and artwork variant from your Spotify catalog…',
  },
  decorators: [withStepFrame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Finishing setup...' })
    ).toBeDisabled();
    await expect(canvas.getByText('3/3')).toBeVisible();
    await expect(canvas.getByText('Link copied to clipboard!')).toBeVisible();
  },
};

/** Right-to-left: the completed step inside an RTL document. */
export const RtlComplete: Story = {
  args: {
    title: 'ملفك منشور الآن',
    prompt: 'ملفك الشخصي جاهز للمشاركة.',
    spotifyImportStatus: 'success',
    spotifyImportStage: 2,
    spotifyImportMessage: 'تم استيراد إصداراتك.',
  },
  decorators: [withRtlStepFrame],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { name: 'ملفك منشور الآن' })
    ).toBeVisible();
  },
};
