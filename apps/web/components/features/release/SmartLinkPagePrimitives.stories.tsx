import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import axe from 'axe-core';
import { expect } from 'storybook/test';
import {
  SmartLinkArtistName,
  SmartLinkArtworkCard,
  SmartLinkPageFrame,
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

type Story = StoryObj<typeof meta>;

/** No artwork yet: the card shows the AudioLines fallback. */
export const EmptyArtwork: Story = {
  args: { artworkUrl: null },
};

/** An artist without a public handle renders as plain text, not a link. */
export const PartialArtistWithoutHandle: Story = {
  parameters: { layout: 'fullscreen' },
  render: args => (
    <SmartLinkPageFrame centered>
      <SmartLinkArtworkCard {...args} artworkUrl={null} />
      <SmartLinkArtistName
        name='Tim White'
        handle={null}
        className='text-center'
      />
    </SmartLinkPageFrame>
  ),
};

/** A long artist line wraps inside the 17rem column. */
export const LongContentArtistName: Story = {
  parameters: { layout: 'fullscreen' },
  render: args => (
    <SmartLinkPageFrame centered>
      <SmartLinkArtworkCard {...args} artworkUrl={null} />
      <SmartLinkArtistName
        name='Tim White, The Midnight Strings Orchestra, Ava Lune and Friends'
        handle='tim'
        className='text-center'
      />
    </SmartLinkPageFrame>
  ),
};

/** The frame, artist line and footer inside a right-to-left page. */
export const Rtl: Story = {
  parameters: { layout: 'fullscreen' },
  render: args => (
    <div dir='rtl' lang='ar'>
      <SmartLinkPageFrame centered>
        <SmartLinkArtworkCard {...args} title='لا تقل كلمة' artworkUrl={null} />
        <SmartLinkArtistName
          name='تيم وايت'
          handle='tim'
          className='text-center'
        />
      </SmartLinkPageFrame>
    </div>
  ),
};
