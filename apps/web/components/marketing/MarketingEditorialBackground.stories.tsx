import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingEditorialBackground } from './MarketingEditorialBackground';
import { marketingFullscreenParameters } from './storybook/marketingStoryMeta';

/**
 * Editorial background masters (JOV-6249): the two approved background
 * variants of one shared system, rendered behind approved receiving content
 * (hero copy + the locked name-search control shape) on the System B page
 * canvas. Values mirror the locked sources cited by the media-recipe
 * contract (JOV-6246).
 */
const meta = {
  title: 'Marketing/Primitives/MarketingEditorialBackground',
  component: MarketingEditorialBackground,
  parameters: {
    ...marketingFullscreenParameters,
    viewport: {
      viewports: {
        desktop: {
          name: 'Desktop',
          styles: { width: '1440px', height: '900px' },
        },
        intermediate: {
          name: 'Intermediate',
          styles: { width: '768px', height: '1024px' },
        },
        mobile: {
          name: 'Mobile',
          styles: { width: '390px', height: '844px' },
        },
      },
      defaultViewport: 'desktop',
    },
    jovie: {
      uncoveredProps: ['idSeed', 'className'],
    },
  },
  args: {
    variant: 'soft',
  },
} satisfies Meta<typeof MarketingEditorialBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

const receivingContent = (
  <div
    style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.5rem',
      padding: '4rem 1.5rem',
      textAlign: 'center',
    }}
  >
    <h1
      style={{
        margin: 0,
        fontFamily: 'var(--font-satoshi), sans-serif',
        fontSize: 'clamp(2.35rem, 5.3vw, 4.75rem)',
        fontWeight: 'var(--font-weight-bold)',
        letterSpacing: 'var(--ds-marketing-display-tracking)',
        lineHeight: 1.02,
        color: 'var(--color-text-primary-token)',
      }}
    >
      Control how the world sees you.
    </h1>
    <p
      style={{
        margin: 0,
        maxWidth: '30rem',
        fontSize: 'clamp(1.0625rem, 1.5vw, 1.375rem)',
        color:
          'var(--color-text-secondary-token, var(--color-text-primary-token))',
      }}
    >
      Find what the internet knows. Turn it into relationships.
    </p>
  </div>
);

export const SoftDesktop: Story = {
  args: { variant: 'soft', children: receivingContent },
};

export const SoftIntermediate: Story = {
  args: { variant: 'soft', children: receivingContent },
  parameters: { viewport: { defaultViewport: 'intermediate' } },
};

export const SoftMobile: Story = {
  args: { variant: 'soft', children: receivingContent },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

export const FlowingDesktop: Story = {
  args: {
    variant: 'flowing',
    idSeed: 'meb-flowing-desktop',
    children: receivingContent,
  },
};

export const FlowingIntermediate: Story = {
  args: {
    variant: 'flowing',
    idSeed: 'meb-flowing-intermediate',
    children: receivingContent,
  },
  parameters: { viewport: { defaultViewport: 'intermediate' } },
};

export const FlowingMobile: Story = {
  args: {
    variant: 'flowing',
    idSeed: 'meb-flowing-mobile',
    children: receivingContent,
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

/** Quiet static field, no children — the standalone master surface. */
export const SoftBare: Story = {
  args: { variant: 'soft' },
};
