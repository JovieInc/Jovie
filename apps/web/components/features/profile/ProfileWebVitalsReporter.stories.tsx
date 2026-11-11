import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileWebVitalsReporter } from './ProfileWebVitalsReporter';

const meta = {
  title: 'Profile/ProfileWebVitalsReporter',
  component: ProfileWebVitalsReporter,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ProfileWebVitalsReporter>;

export default meta;

export const AfterFirstPaint: StoryObj<typeof ProfileWebVitalsReporter> = {
  render: () => (
    <div className='min-h-40 bg-base p-8 text-primary-token'>
      <p className='text-sm'>
        The web vitals reporter mounts with no visible chrome. It starts the
        LCP, INP, CLS, FCP and TTFB observers 300ms after first paint.
      </p>
      <ProfileWebVitalsReporter />
    </div>
  ),
};
