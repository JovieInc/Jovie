import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { SettingsPaymentsSection } from './SettingsPaymentsSection';

const StripeStatusDecorator: Decorator = Story => {
  useEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          connected: true,
          onboardingComplete: true,
          payoutsEnabled: true,
          email: 'artist@example.com',
          onboardingAvailable: true,
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }
      );

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, []);

  return <Story />;
};

const meta = {
  title: 'Dashboard/Organisms/SettingsPaymentsSection',
  component: SettingsPaymentsSection,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [StripeStatusDecorator],
} satisfies Meta<typeof SettingsPaymentsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
