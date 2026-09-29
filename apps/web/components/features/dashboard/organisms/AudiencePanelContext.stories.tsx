import { Button } from '@jovie/ui';
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
        <Button
          key={panel}
          size='sm'
          variant='outline'
          onClick={() => toggle(panel)}
          aria-pressed={mode === panel}
        >
          {panel}
        </Button>
      ))}
      <Button size='sm' variant='link' onClick={close}>
        Close
      </Button>
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
