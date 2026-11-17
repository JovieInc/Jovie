import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { type ComparisonData, getComparison } from '@/content/comparisons';
import { ComparisonPageContent } from './ComparisonPageContent';

/**
 * State coverage for the comparison body. These start from the checked-in
 * linktree comparison used by the web-027 story and change only the data the
 * route passes or the document direction.
 */
const linktree = getComparison('linktree');

if (!linktree) {
  throw new Error('Missing canonical linktree comparison fixture');
}

const meta = {
  title: 'Marketing/Fixtures/ComparisonPageContent States',
  component: ComparisonPageContent,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    data: linktree,
  },
} satisfies Meta<typeof ComparisonPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a comparison with no feature rows and no questions yet. */
export const EmptyFeaturesAndFaq: Story = {
  args: {
    data: { ...linktree, features: [], faq: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const table = canvas.getByRole('table');
    await expect(within(table).getAllByRole('row')).toHaveLength(1);
  },
};

const longData: ComparisonData = {
  ...linktree,
  heroHeadline:
    'Jovie vs Linktree for independent artists, DJs and labels who release often',
  heroSubheadline:
    'Both products give artists one link for everything. This long subheadline runs across several lines on purpose so the hero can be checked for wrapping over the low-opacity background image at every width.',
  features: [
    ...linktree.features,
    ...linktree.features.map(feature => ({
      ...feature,
      name: `${feature.name} (extended row with a deliberately long feature name)`,
      note: 'A long note under the feature name that explains a nuance of the comparison in more detail than usual.',
    })),
  ],
};

/** Long content: long hero copy and a doubled matrix with long names and notes. */
export const LongContentMatrix: Story = {
  args: {
    data: longData,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: longData.heroHeadline })
    ).toBeVisible();
  },
};

/** Right-to-left: the comparison body inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Feature Comparison' })
    ).toBeVisible();
  },
};
