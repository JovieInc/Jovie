import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  AudiencePanelProvider,
  useAudiencePanel,
} from './AudiencePanelContext';

function AudiencePanelDemo() {
  const { mode, toggle, close } = useAudiencePanel();
  return (
    <div className='flex items-center gap-2'>
      {(['contact', 'analytics', 'ai-crawlers'] as const).map(panel => (
        <button
          key={panel}
          type='button'
          onClick={() => toggle(panel)}
          className='rounded-full border border-subtle px-3 py-1 text-app'
          aria-pressed={mode === panel}
        >
          {panel}
        </button>
      ))}
      <button type='button' onClick={close} className='text-app underline'>
        Close
      </button>
      <span className='text-app text-tertiary-token'>
        active: {mode ?? 'none'}
      </span>
    </div>
  );
}

const meta = {
  title: 'Dashboard/Organisms/AudiencePanelContext',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AudiencePanelDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  render: () => (
    <AudiencePanelProvider>
      <AudiencePanelDemo />
    </AudiencePanelProvider>
  ),
};

export const OpenToAnalytics: Story = {
  render: () => (
    <AudiencePanelProvider initialMode='analytics'>
      <AudiencePanelDemo />
    </AudiencePanelProvider>
  ),
};
