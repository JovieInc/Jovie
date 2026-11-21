import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DrawerSection } from './DrawerSection';
import { DrawerSectionGroup } from './DrawerSectionGroup';

const meta = {
  title: 'Molecules/Drawer/DrawerSectionGroup',
  component: DrawerSectionGroup,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 space-y-2 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <>
        <DrawerSection title='Facts' sectionId='facts'>
          <p className='text-sm text-secondary-token'>Fact content.</p>
        </DrawerSection>
        <DrawerSection title='Links' sectionId='links'>
          <p className='text-sm text-secondary-token'>Link content.</p>
        </DrawerSection>
      </>
    ),
  },
} satisfies Meta<typeof DrawerSectionGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllCollapsed: Story = {};

export const OneOpenByDefault: Story = {
  args: {
    defaultOpenSectionId: 'facts',
  },
};

export const OpeningOneClosesTheOther: Story = {
  args: {
    defaultOpenSectionId: 'facts',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const factsTrigger = canvas.getByRole('button', { name: 'Facts' });
    const linksTrigger = canvas.getByRole('button', { name: 'Links' });
    await expect(factsTrigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(linksTrigger);
    await expect(linksTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(factsTrigger).toHaveAttribute('aria-expanded', 'false');
  },
};

export const LongContent: Story = {
  args: {
    defaultOpenSectionId: 'links',
    children: (
      <>
        <DrawerSection
          title='Release facts, credits and distribution metadata'
          sectionId='facts'
        >
          <p className='text-sm text-secondary-token'>Fact content.</p>
        </DrawerSection>
        <DrawerSection
          title='Streaming links, presave destinations and store pages'
          sectionId='links'
        >
          <p className='text-sm text-secondary-token'>
            Spotify, Apple Music, YouTube Music, Tidal, Deezer, Amazon Music,
            SoundCloud, Beatport, Bandcamp and Audiomack links appear here once
            the catalog sync finishes for every territory.
          </p>
        </DrawerSection>
        <DrawerSection
          title='Analytics for the last 28 days across every territory'
          sectionId='analytics'
        >
          <p className='text-sm text-secondary-token'>Analytics content.</p>
        </DrawerSection>
      </>
    ),
  },
};

export const Rtl: Story = {
  args: {
    defaultOpenSectionId: 'facts',
    children: (
      <>
        <DrawerSection title='الحقائق' sectionId='facts'>
          <p className='text-sm text-secondary-token'>محتوى الحقائق.</p>
        </DrawerSection>
        <DrawerSection title='الروابط' sectionId='links'>
          <p className='text-sm text-secondary-token'>محتوى الروابط.</p>
        </DrawerSection>
      </>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
