import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HypotheticalDilutionPreview } from './HypotheticalDilutionPreview';

/**
 * Rendered states of the dilution preview. Every value here is synthetic and
 * typed into the local-only form; nothing is saved or sent.
 */
const meta: Meta<typeof HypotheticalDilutionPreview> = {
  title: 'Features/Admin/Investors/HypotheticalDilutionPreview/States',
  component: HypotheticalDilutionPreview,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof HypotheticalDilutionPreview>;

async function open(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    canvas.getByText(/Hypothetical Dilution/, { selector: 'h2' })
  );
  return canvas;
}

async function fill(
  canvas: ReturnType<typeof within>,
  values: Partial<Record<string, string>>
) {
  for (const [label, value] of Object.entries(values)) {
    if (value) await userEvent.type(canvas.getByLabelText(label), value);
  }
}

/** Empty: the disclosure is open and no scenario has been entered. */
export const EmptyScenario: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await open(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Enter a hypothetical scenario. Nothing is saved.'
    );
  },
};

/** Partial: some amounts typed, assumptions not yet confirmed. */
export const PartialScenario: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await open(canvasElement);
    await fill(canvas, {
      'Ownership Before (%)': '72',
      'Valuation (USD)': '8000000',
    });
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Confirm the assumptions to preview ownership.'
    );
  },
};

/** Error: confirmed with invalid inputs, so each field shows its error. */
export const ErrorInvalidInputs: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await open(canvasElement);
    await fill(canvas, {
      'Ownership Before (%)': '140',
      'Valuation (USD)': '0',
    });
    await userEvent.click(canvas.getByRole('checkbox'));
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Check the highlighted inputs.'
    );
    await expect(canvas.getByText('Enter 0 to 100.')).toBeInTheDocument();
  },
};

/** Long content: amounts near the $1 trillion limit in the result row. */
export const LongContentLargeAmounts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await open(canvasElement);
    await fill(canvas, {
      'Ownership Before (%)': '33.333333',
      'Valuation (USD)': '999999999999.99',
      'Committed, Unissued Cash (USD)': '250000000000.55',
      'Proposed Cash (USD)': '499999999999.45',
    });
    await userEvent.click(canvas.getByRole('checkbox'));
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Hypothetical estimate. Economic ownership only.'
    );
  },
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: the synthetic example inside a right-to-left admin page. */
export const RtlSyntheticExample: Story = {
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    const canvas = await open(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Load Synthetic Example' })
    );
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Synthetic example.'
    );
  },
};
