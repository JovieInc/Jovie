import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UniversalLinkInputUrlMode } from './UniversalLinkInputUrlMode';

const meta = {
  title: 'Features/Dashboard/Molecules/UniversalLinkInputUrlMode',
  component: UniversalLinkInputUrlMode,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'url',
        'placeholder',
        'detectedLink',
        'inputRef',
        'onUrlChange',
        'onKeyDown',
        'onClear',
        'onPlatformSelect',
        'platform',
        'onArtistSearchSelect',
        'onRestoreFocus',
        'disabled',
      ],
    },
  },
} satisfies Meta<typeof UniversalLinkInputUrlMode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
