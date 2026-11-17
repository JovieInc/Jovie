import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PmfSurveyCard } from './PmfSurveyCard';

const saved = async () => ({ ok: true });
const unreachable = async (): Promise<{ ok: boolean }> => {
  throw new TypeError('Failed to fetch');
};

/** Rendered states of the one-question PMF survey card. */
const meta = {
  title: 'Features/PmfSurvey/PmfSurveyCard/States',
  component: PmfSurveyCard,
  parameters: { layout: 'padded' },
  args: { onSubmit: fn(saved), onDismiss: fn(saved) },
} satisfies Meta<typeof PmfSurveyCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const withCardWidth: Decorator = function WithCardWidth(Story) {
  return (
    <div className='max-w-xl'>
      <Story />
    </div>
  );
};

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar' className='max-w-xl'>
      <Story />
    </div>
  );
};

/** Error: the last answer was not saved and the card offers a retry. */
export const ErrorNotSaved: Story = {
  args: { initialState: 'error' },
  decorators: [withCardWidth],
};

/** Offline: sending fails at the network and the card keeps the answer. */
export const OfflineSendFails: Story = {
  args: { onSubmit: fn(unreachable) },
  decorators: [withCardWidth],
  play: async function playOfflineSendFails({ canvasElement }) {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('radio', { name: 'Somewhat Disappointed' })
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Send answer' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Your answer was not saved. Try again.'
    );
    await expect(
      canvas.getByRole('radio', { name: 'Somewhat Disappointed' })
    ).toBeChecked();
  },
};

/** Long content: a long typed benefit wraps inside the field. */
export const LongContentBenefit: Story = {
  decorators: [withCardWidth],
  play: async function playLongContentBenefit({ canvasElement }) {
    const canvas = within(canvasElement);
    const field = canvas.getByLabelText(/main benefit/);
    await userEvent.type(
      field,
      'Every release gets one link that works on every service, the pre-save turns into a save on release day, and I can see which fans came from which post without building a spreadsheet.'
    );
    await expect(field).toHaveValue(
      'Every release gets one link that works on every service, the pre-save turns into a save on release day, and I can see which fans came from which post without building a spreadsheet.'
    );
  },
};

/** Right-to-left: the card in an Arabic document direction. */
export const RtlDocument: Story = {
  decorators: [withRtlDocument],
};
