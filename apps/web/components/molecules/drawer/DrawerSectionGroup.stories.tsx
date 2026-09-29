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
