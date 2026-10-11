import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { STATUS_GLYPH_STATES, StatusGlyph } from './status-glyph';

const meta: Meta<typeof StatusGlyph> = {
  title: 'UI/Atoms/StatusGlyph',
  component: StatusGlyph,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      {STATUS_GLYPH_STATES.map(state => (
        <StatusGlyph key={state} state={state} />
      ))}
    </div>
  ),
};

export const WithLabels: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      {STATUS_GLYPH_STATES.map(state => (
        <StatusGlyph key={state} state={state} label={state} />
      ))}
    </div>
  ),
};

export const Small: Story = {
  render: () => (
    <div className='flex items-center gap-3'>
      {STATUS_GLYPH_STATES.map(state => (
        <StatusGlyph key={state} state={state} size='sm' />
      ))}
    </div>
  ),
};
