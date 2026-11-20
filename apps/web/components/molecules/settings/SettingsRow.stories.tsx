import { Button, Switch, TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SettingsGroup } from './SettingsPanel';
import { SettingsRow, settingsRowIds } from './SettingsRow';

const meta = {
  title: 'Molecules/Settings/SettingsRow',
  component: SettingsRow,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className='max-w-(--app-shell-content-max-form)'>
          <SettingsGroup>
            <Story />
          </SettingsGroup>
        </div>
      </TooltipProvider>
    ),
  ],
  args: {
    title: 'Interface theme',
    description: 'Select or customize your interface color scheme',
    control: (
      <Button type='button' variant='secondary' size='sm' onClick={fn()}>
        System
      </Button>
    ),
  },
} satisfies Meta<typeof SettingsRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const contrastIds = settingsRowIds('story-contrast');

export const WithSwitch: Story = {
  args: {
    id: 'story-contrast',
    title: 'High contrast',
    description: 'Increase contrast for text, borders, and surfaces.',
    control: (
      <Switch
        checked
        onCheckedChange={fn()}
        aria-labelledby={contrastIds.titleId}
        aria-describedby={contrastIds.descriptionId}
      />
    ),
  },
};

export const Destructive: Story = {
  args: {
    title: 'Delete account',
    description: 'Permanently remove your account and data.',
    tone: 'destructive',
    control: (
      <Button type='button' variant='secondary' size='sm' destructive>
        Delete
      </Button>
    ),
  },
};

export const Disabled: Story = {
  args: {
    title: 'High contrast',
    description: 'Select a profile to change this setting.',
    disabled: true,
    control: <Switch checked={false} disabled aria-label='High contrast' />,
  },
};

export const Gated: Story = {
  args: {
    title: 'Double opt-in verification',
    description: 'New fans confirm their email before notifications begin.',
    gated: { planName: 'Max', featureContext: 'Double opt-in confirmation' },
  },
};

export const LongContent: Story = {
  args: {
    title: 'Sessions on every device you have ever signed in from',
    description:
      'Last active a few minutes ago from Chrome on macOS in Los Angeles, California, United States, on a network you have used before',
  },
};

export const RtlOverflow: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'سمة الواجهة',
    description:
      'اختر نظام ألوان الواجهة أو خصصه ليناسب جهازك ويظهر بالشكل الصحيح في كل مكان',
  },
};

export const WithBody: Story = {
  args: {
    title: 'Rider',
    description: 'Hospitality and technical requirements',
    children: (
      <p className='text-xs text-secondary-token'>Inline editor body</p>
    ),
  },
};
