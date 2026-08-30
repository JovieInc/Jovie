import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileDrawerShell } from './ProfileDrawerShell';

const meta: Meta<typeof ProfileDrawerShell> = {
  title: 'Profile/ProfileDrawerShell',
  component: ProfileDrawerShell,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'subtitle',
        'onBack',
        'navigationLevel',
        'contentClassName',
        'bodyClassName',
        'dataTestId',
        'centerTitle',
      ],
    },
  },
  args: {
    open: true,
    onOpenChange: () => undefined,
    title: 'Menu',
    presentation: 'modal',
    children: <button type='button'>Share Profile</button>,
  },
};

export default meta;

export const Open: StoryObj<typeof ProfileDrawerShell> = {};
