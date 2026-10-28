import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { InfoPopover } from './InfoPopover';

const meta = {
  title: 'Molecules/Inspector/InfoPopover',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: InfoPopover,
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 1024] },
    jovie: { uncoveredProps: ['side', 'align', 'testId'] },
  },
  args: {
    label: 'About downloads',
    children: <p>Helper copy stays behind ⓘ.</p>,
  },
} satisfies Meta<typeof InfoPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DownloadsHelper: Story = {};

export const HelperOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'About downloads' })
    );
    await expect(await body.findByRole('dialog')).toHaveTextContent(
      'Helper copy'
    );
    await userEvent.keyboard('{Escape}');
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'About downloads' })
    );
    await expect(await body.findByRole('dialog')).toBeVisible();
  },
};
