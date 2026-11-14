import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PmfSurveyCard } from './PmfSurveyCard';

const saved = async () => ({ ok: true });
const notSaved = async () => ({ ok: false });

const meta = {
  title: 'Features/PmfSurvey/PmfSurveyCard',
  component: PmfSurveyCard,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div className='max-w-xl'>
        <Story />
      </div>
    ),
  ],
  args: {
    onSubmit: fn(saved),
    onDismiss: fn(saved),
  },
} satisfies Meta<typeof PmfSurveyCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Answered: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('radio', { name: 'Very Disappointed' })
    );
    await userEvent.type(
      canvas.getByLabelText(/main benefit/),
      'Every release in one link'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Send answer' }));
    await expect(
      await canvas.findByText('Thanks for answering')
    ).toBeInTheDocument();
    await expect(args.onSubmit).toHaveBeenCalledWith({
      response: 'very_disappointed',
      mainBenefit: 'Every release in one link',
    });
  },
};

export const Pending: Story = { args: { initialState: 'pending' } };

export const SaveFailed: Story = {
  args: { onSubmit: fn(notSaved) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('radio', { name: 'Somewhat Disappointed' })
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Send answer' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Your answer was not saved. Try again.'
    );
  },
};

export const Thanks: Story = { args: { initialState: 'done' } };
