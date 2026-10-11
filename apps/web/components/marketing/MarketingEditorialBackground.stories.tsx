import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MarketingEditorialBackground,
  type MarketingEditorialBackgroundProps,
} from '@/components/marketing/MarketingEditorialBackground';
import type { MarketingEditorialBackgroundVariantId } from '@/data/marketing';
import { MARKETING_EDITORIAL_BACKGROUND_VARIANT_IDS } from '@/data/marketing';
import {
  MARKETING_STORY_DESCRIPTION,
  marketingFullscreenParameters,
  recipeViewports,
} from './storybook/marketingStoryMeta';

/**
 * Editorial background masters (JOV-6249, spec JOV-6246) rendered behind the
 * same approved content block at desktop/mobile/intermediate widths. Review
 * directionality, calm dark regions, readable contrast, and accent-hue
 * consistency; the same stills serve reduced-motion and failed-media states.
 */
function BackgroundCanvas({
  variant,
}: {
  readonly variant: MarketingEditorialBackgroundVariantId;
}) {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <MarketingEditorialBackground variant={variant} />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '0 8%',
          maxWidth: '34rem',
        }}
      >
        <p
          style={{
            color: 'var(--noir-ion-text-muted)',
            fontSize: '0.8125rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Editorial background · {variant}
        </p>
        <h1
          style={{
            color: 'var(--noir-ion-text-primary)',
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            lineHeight: 1.05,
            margin: '0.5rem 0 1rem',
          }}
        >
          Your music, everywhere it matters.
        </h1>
        <p
          style={{
            color: 'var(--noir-ion-text-muted)',
            fontSize: '1.0625rem',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          One page for your releases, your fans, and your next move. The
          background stays calm where content lands.
        </p>
      </div>
    </section>
  );
}

const meta = {
  title: 'Marketing/Backgrounds',
  component: MarketingEditorialBackground,
  parameters: {
    ...marketingFullscreenParameters,
    docs: {
      description: {
        component: `${MARKETING_STORY_DESCRIPTION} Registered editorial background variants: ${MARKETING_EDITORIAL_BACKGROUND_VARIANT_IDS.join(', ')}.`,
      },
    },
    viewport: {
      viewports: recipeViewports,
      defaultViewport: 'desktop',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingEditorialBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Soft: Story = {
  render: (args: MarketingEditorialBackgroundProps) => (
    <BackgroundCanvas variant={args.variant} />
  ),
  args: { variant: 'soft' },
};

export const Flow: Story = {
  render: (args: MarketingEditorialBackgroundProps) => (
    <BackgroundCanvas variant={args.variant} />
  ),
  args: { variant: 'flow' },
};
