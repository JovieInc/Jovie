import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import axe from 'axe-core';
import { expect } from 'storybook/test';
import {
  SmartLinkArtworkCard,
  SmartLinkPoweredByFooter,
} from './SmartLinkPagePrimitives';

const meta = {
  title: 'Release/SmartLinkArtworkCard',
  component: SmartLinkArtworkCard,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['name', 'handle'] },
  },
  args: {
    title: 'Never Say A Word',
    artworkUrl: '/art.jpg',
  },
} satisfies Meta<typeof SmartLinkArtworkCard>;

export default meta;
export const Default: StoryObj<typeof meta> = {};

export const PoweredByDark: StoryObj<typeof meta> = {
  parameters: {
    themes: { themeOverride: 'dark' },
    a11y: { test: 'error' },
  },
  render: () => (
    <div className='bg-base p-5 text-foreground'>
      <SmartLinkPoweredByFooter />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { violations } = await axe.run(canvasElement, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
    });
    await expect(violations).toEqual([]);
  },
};

export const PoweredByLight: StoryObj<typeof meta> = {
  ...PoweredByDark,
  parameters: {
    themes: { themeOverride: 'light' },
    a11y: { test: 'error' },
  },
};
