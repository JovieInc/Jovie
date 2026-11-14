import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fireEvent, within } from 'storybook/test';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';
import { marketingFullscreenParameters } from './storybook/marketingStoryMeta';

/**
 * Large product-frame recipe (JOV-6247): founder-locked dark-glass material
 * plus the responsive feature-focus treatment, rendered over a neutral
 * backdrop with approved marketing-export captures.
 */
const meta = {
  title: 'Marketing/ProductScreenshotFrame',
  component: ProductScreenshotFrame,
  parameters: {
    ...marketingFullscreenParameters,
    viewport: {
      viewports: {
        desktop: {
          name: 'Desktop',
          styles: { width: '1440px', height: '900px' },
        },
        tablet: {
          name: 'Tablet',
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
      uncoveredProps: ['sizes', 'priority', 'altOverride', 'aria-hidden'],
    },
  },
  decorators: [
    Story => (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '3rem 1.5rem',
          background:
            'linear-gradient(160deg, #0b0d12 0%, #10131c 55%, #0b0d12 100%)',
        }}
      >
        <div style={{ width: 'min(960px, 100%)' }}>
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    scenarioId: 'dashboard-releases-sidebar-desktop',
    sizes: '(min-width: 1024px) 960px, 100vw',
  },
} satisfies Meta<typeof ProductScreenshotFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flat: Story = {
  args: { variant: 'flat' },
};

export const DarkGlassDesktop: Story = {
  args: { variant: 'dark-glass' },
};

export const DarkGlassTablet: Story = {
  args: { variant: 'dark-glass' },
  parameters: { viewport: { defaultViewport: 'tablet' } },
};

export const DarkGlassPhone: Story = {
  args: {
    variant: 'dark-glass',
    device: 'phone',
    scenarioId: 'public-profile-mobile',
    sizes: '(min-width: 640px) 320px, 80vw',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  decorators: [
    Story => (
      <div style={{ width: 'min(320px, 100%)', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
};

/** Registry-declared feature focus (tim-white-profile-pay-mobile). */
export const FeatureFocusFromRegistry: Story = {
  args: {
    variant: 'dark-glass',
    device: 'phone',
    scenarioId: 'tim-white-profile-pay-mobile',
    sizes: '(min-width: 640px) 320px, 80vw',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  decorators: [
    Story => (
      <div style={{ width: 'min(320px, 100%)', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
};

/** Explicit focal positioning with a long label to prove truncation. */
export const FeatureFocusLongLabel: Story = {
  args: {
    variant: 'dark-glass',
    focus: {
      label:
        'Unified release sidebar with per-platform status across every connected DSP',
      region: { x: 62, y: 6, width: 34, height: 88 },
      mobileRegion: { x: 40, y: 4, width: 56, height: 92 },
    },
  },
};

/** Fill mode for crossfade slots and other sized parents. */
export const DarkGlassFill: Story = {
  args: { variant: 'dark-glass', fill: true },
  decorators: [
    Story => (
      <div style={{ width: 'min(960px, 100%)', aspectRatio: '16 / 10' }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Error: the capture failed to load (a missing export behaves the same). The
 * play function fires the image's error event, and the frame keeps its
 * geometry with the named "Preview unavailable" fallback.
 */
export const ErrorPreviewUnavailable: Story = {
  args: { variant: 'dark-glass' },
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector('img.psf__image');
    await expect(image).not.toBeNull();
    if (image) fireEvent.error(image);
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Preview unavailable')
    ).toBeInTheDocument();
    await expect(
      canvasElement.querySelector('[data-status="error"]')
    ).not.toBeNull();
  },
};

/** Long content: a long focus label on the narrowest (phone) frame truncates. */
export const LongContentPhoneFocusLabel: Story = {
  args: {
    variant: 'dark-glass',
    device: 'phone',
    scenarioId: 'public-profile-mobile',
    sizes: '(min-width: 640px) 320px, 80vw',
    focus: {
      label:
        'Every link, release and contact option on one profile, ordered by what visitors tap first',
      region: { x: 6, y: 30, width: 88, height: 40 },
    },
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  decorators: [
    Story => (
      <div style={{ width: 'min(320px, 100%)', margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: an Arabic focus label inside an RTL document. */
export const RtlFocusLabel: Story = {
  args: {
    variant: 'dark-glass',
    focus: {
      label: 'شريط الإصدارات الموحد',
      region: { x: 62, y: 6, width: 34, height: 88 },
    },
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
