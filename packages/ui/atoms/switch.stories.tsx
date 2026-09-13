import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Label } from './label';
import { Switch } from './switch';

const meta: Meta<typeof Switch> = {
  title: 'UI/Atoms/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Switch id='sw-default' />
      <Label htmlFor='sw-default'>Notifications</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Switch id='sw-on' defaultChecked />
      <Label htmlFor='sw-on'>Notifications enabled</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className='grid gap-4'>
      <div className='flex items-center gap-2'>
        <Switch id='sw-off-dis' disabled />
        <Label htmlFor='sw-off-dis'>Disabled</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch id='sw-on-dis' disabled defaultChecked />
        <Label htmlFor='sw-on-dis'>Disabled and enabled</Label>
      </div>
    </div>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <div className='grid gap-4'>
      <div className='flex items-center gap-2'>
        <Switch id='sw-matrix-off' />
        <Label htmlFor='sw-matrix-off'>Off</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch id='sw-matrix-on' defaultChecked />
        <Label htmlFor='sw-matrix-on'>On</Label>
      </div>
    </div>
  ),
};

export const ConformanceMatrix: Story = {
  render: () => (
    <div className='grid gap-4' data-testid='switch-conformance'>
      <div className='flex items-center gap-2'>
        <Switch id='sw-conformance-keyboard' aria-label='Keyboard toggle' />
        <Label htmlFor='sw-conformance-keyboard'>Keyboard toggle</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          id='sw-conformance-checked'
          aria-label='Checked toggle'
          defaultChecked
        />
        <Label htmlFor='sw-conformance-checked'>Checked</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          id='sw-conformance-disabled'
          aria-label='Disabled toggle'
          disabled
        />
        <Label htmlFor='sw-conformance-disabled'>Disabled</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          id='sw-conformance-invalid'
          aria-label='Invalid toggle'
          aria-invalid='true'
        />
        <Label htmlFor='sw-conformance-invalid'>Invalid</Label>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const keyboardSwitch = canvasElement.querySelector<HTMLElement>(
      '[role="switch"][aria-label="Keyboard toggle"]'
    );
    await waitFor(() => expect(keyboardSwitch).toBeInTheDocument());
    if (!keyboardSwitch) return;

    await userEvent.tab();
    await expect(keyboardSwitch).toHaveFocus();
    await expect(keyboardSwitch).toHaveAttribute('aria-checked', 'false');
    await userEvent.keyboard(' ');
    await expect(keyboardSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(keyboardSwitch).toHaveFocus();

    const invalidSwitch = canvasElement.querySelector<HTMLElement>(
      '[role="switch"][aria-invalid="true"]'
    );
    await expect(invalidSwitch).toBeInTheDocument();
    await expect(invalidSwitch).toHaveAttribute('aria-invalid', 'true');

    const disabledSwitch = canvasElement.querySelector<HTMLElement>(
      '[role="switch"][disabled]'
    );
    await expect(disabledSwitch).toBeDisabled();

    const visibleBox = keyboardSwitch.getBoundingClientRect();
    const hitTarget = getComputedStyle(keyboardSwitch, '::before');
    await expect([visibleBox.width, visibleBox.height]).toEqual([28, 16]);
    await expect([hitTarget.width, hitTarget.height]).toEqual(['44px', '44px']);
  },
  parameters: {
    docs: {
      description: {
        story:
          'Canonical Switch proof: unchecked, checked, disabled, invalid, focus, Space activation, and the 28×16 visual control with a 44px hit target.',
      },
    },
  },
};
