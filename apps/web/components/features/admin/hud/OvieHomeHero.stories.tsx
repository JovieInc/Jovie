import '@/app/globals.css';
import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui/atoms/button';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { HOME_LOOP_FIXTURE_STRIP } from '@/components/organisms/home-loop/fixtures';
import { buildPulse } from '@/lib/ovie/home/shipping-home';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { OVIE_HOME_COPY } from './OvieHomeCanvas';
import { OvieHomeHero, type OvieHomeHeroProps } from './OvieHomeHero';

const empty = buildPulse(emptyDeliverySummary());
const meta = {
  title: 'Features/Admin/Hud/OvieHomeHero',
  component: OvieHomeHero,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='@container bg-base p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    copy: OVIE_HOME_COPY,
    constraint: null,
    tiles: empty,
    status: 'ready',
    strip: HOME_LOOP_FIXTURE_STRIP,
    coverage: '14 of 31 stages measured',
  },
} satisfies Meta<typeof OvieHomeHero>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unmeasured: Story = {};
export const Loading: Story = { args: { tiles: [], status: 'loading' } };
export const ErrorState: Story = { args: { tiles: [], status: 'error' } };
export const MeasuredZero: Story = {
  args: {
    tiles: empty.map(tile =>
      tile.key === 'merges-hour'
        ? { ...tile, measured: true, value: '0', was: '2', tone: 'warn' }
        : tile
    ),
  },
};

function HeroStateTransition(args: OvieHomeHeroProps) {
  const [step, setStep] = useState(0);
  const tiles = empty.map(tile =>
    tile.key === 'merges-hour' && step >= 2
      ? {
          ...tile,
          measured: true,
          value: step === 2 ? '0' : '123,456',
          was: '2',
          tone: 'warn' as const,
        }
      : tile
  );
  return (
    <div className='flex min-h-dvh flex-col gap-4'>
      <Button onClick={() => setStep((step + 1) % 5)}>
        Next shipping state
      </Button>
      <OvieHomeHero
        {...args}
        status={step === 0 ? 'loading' : step === 4 ? 'error' : 'ready'}
        tiles={tiles}
      />
      <p data-testid='hero-following-content'>{args.copy.inFlightTitle}</p>
    </div>
  );
}
export const StableStates: Story = { render: HeroStateTransition };
