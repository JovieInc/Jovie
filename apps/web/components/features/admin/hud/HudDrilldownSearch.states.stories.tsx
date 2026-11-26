import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
import { HudDrilldownSearch } from './HudDrilldownSearch';

const degraded = cockpitMetrics({
  operations: { status: 'degraded', dbLatencyMs: 240 },
});

async function openExceptions(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('hud-drilldown-scope-exceptions'));
  return canvas;
}

const meta = {
  title: 'Features/Admin/Hud/HudDrilldownSearch/States',
  component: HudDrilldownSearch,
  parameters: { layout: 'centered' },
  args: { metrics: cockpitMetrics() },
  decorators: [
    Story => (
      <div className='w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HudDrilldownSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the exceptions scope with nothing wrong shows the nominal line. */
export const EmptyNominal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openExceptions(canvasElement);
    await expect(canvas.getByText('Systems nominal.')).toBeVisible();
  },
};

/** Error: a degraded system is listed as a live exception. */
export const ErrorExceptionListed: Story = {
  args: { metrics: degraded },
  play: async ({ canvasElement }) => {
    const canvas = await openExceptions(canvasElement);
    await expect(
      canvas.getByTestId('hud-drilldown-exception-operations-degraded')
    ).toBeVisible();
  },
};

/** Long content: a long query that matches nothing in the exception list. */
export const LongContentQuery: Story = {
  args: { metrics: degraded },
  play: async ({ canvasElement }) => {
    const canvas = await openExceptions(canvasElement);
    await userEvent.type(
      canvas.getByTestId('hud-drilldown-search'),
      'a very long search phrase that goes well past the width of the field'
    );
    await expect(
      canvas.getByText('No exceptions match your search.')
    ).toBeVisible();
  },
};

/** Offline: a database that is slow or down is listed as an exception. */
export const OfflineDatabaseDown: Story = {
  args: {
    metrics: cockpitMetrics({
      operations: { status: 'down', dbLatencyMs: 5000 },
    }),
  },
  play: async ({ canvasElement }) => {
    await openExceptions(canvasElement);
  },
};

/** Rtl: right-to-left layout keeps the scope tabs and field aligned. */
export const RtlOverflow: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
