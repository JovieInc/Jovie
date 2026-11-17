import { Button, Switch } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsGroup, SettingsPanel } from './SettingsPanel';
import { SettingsRow } from './SettingsRow';

const meta: Meta<typeof SettingsPanel> = {
  title: 'Molecules/Settings/SettingsPanel',
  component: SettingsPanel,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Appearance',
    description: 'Theme and contrast preferences for your workspace.',
    bodyClassName: 'px-4 py-4 sm:px-5',
    children: (
      <div className='w-160 text-app text-secondary-token'>
        Compact settings content
      </div>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof SettingsPanel>;

export const Default: Story = {};

export const WithAction: Story = {
  args: {
    actions: (
      <Button type='button' size='sm'>
        Save
      </Button>
    ),
  },
};

/** SettingsGroup: one row in one rounded group. */
export const GroupOneRow: Story = {
  render: () => (
    <div className='w-160'>
      <SettingsGroup title='Account'>
        <SettingsRow
          title='Email'
          description='Used to sign in'
          control={
            <span className='text-xs text-secondary-token'>
              ada@example.com
            </span>
          }
        />
      </SettingsGroup>
    </div>
  ),
};

/** SettingsGroup: five rows with hairline dividers. */
export const GroupFiveRows: Story = {
  render: () => (
    <div className='w-160'>
      <SettingsGroup
        title='Preferences'
        action={
          <Button type='button' variant='ghost' size='sm'>
            Reset
          </Button>
        }
      >
        <SettingsRow
          title='Interface theme'
          description='Light, Dark or System'
          control={
            <Button type='button' variant='secondary' size='sm'>
              System
            </Button>
          }
        />
        <SettingsRow
          title='High contrast'
          description='Increase contrast for text, borders, and surfaces.'
          control={<Switch checked={false} aria-label='High contrast' />}
        />
        <SettingsRow title='Email' description='ada@example.com' />
        <SettingsRow title='Handle' description='@ada' />
        <SettingsRow
          title='Sign out other sessions'
          tone='destructive'
          control={
            <Button type='button' variant='secondary' size='sm' destructive>
              Sign Out
            </Button>
          }
        />
      </SettingsGroup>
    </div>
  ),
};

/** A group with a very long heading and row copy. */
export const LongContent: Story = {
  render: () => (
    <div className='w-160'>
      <SettingsGroup title='Notifications for every release, show and fan subscription'>
        <SettingsRow
          title='Double opt-in verification for every new fan who subscribes'
          description='New fans confirm their email before notifications begin, which protects deliverability for every send'
        />
      </SettingsGroup>
    </div>
  ),
};

export const RtlOverflow: Story = {
  render: () => (
    <div dir='rtl' className='w-160'>
      <SettingsGroup title='المظهر'>
        <SettingsRow
          title='سمة الواجهة'
          description='اختر نظام ألوان الواجهة أو خصصه ليناسب جهازك ويظهر بالشكل الصحيح'
        />
      </SettingsGroup>
    </div>
  ),
};
