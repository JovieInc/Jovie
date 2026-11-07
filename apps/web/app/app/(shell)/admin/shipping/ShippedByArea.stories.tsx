import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShippedByAreaView } from './ShippedByArea';

const pr = (repo: string, number: number, title: string) => ({
  repo,
  number,
  title,
  url: `https://github.com/JovieInc/${repo}/pull/${number}`,
  mergedAt: '2026-10-25T01:00:00Z',
});

const meta = {
  title: 'Features/Admin/Shipping/ShippedByArea',
  component: ShippedByAreaView,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-[28rem] bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShippedByAreaView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    recent: [
      pr('Jovie', 23001, 'fix(billing): retry a failed charge once'),
      pr('Jovie', 23002, 'feat(inbox): show brand deals with budget'),
      pr('Jovie', 23003, 'chore(deps): bump zod'),
      pr('Jovie', 23004, 'fix(lanes): honour human-decision holds'),
      pr('LogYourBody', 812, 'fix(ios): keep the sheet open after save'),
    ],
  },
};

export const Empty: Story = { args: { recent: [] } };
