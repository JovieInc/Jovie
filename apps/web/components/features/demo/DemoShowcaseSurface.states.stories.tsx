import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoShowcaseSurface } from './DemoShowcaseSurface';

/**
 * State coverage for the demo showcase router. The release surface reads its
 * state from the `state` query param, so each story sets that query.
 */
const meta = {
  title: 'Features/Demo/DemoShowcaseSurface States',
  component: DemoShowcaseSurface,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    surface: 'releases',
  },
} satisfies Meta<typeof DemoShowcaseSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the release import is still running. */
export const LoadingImporting: Story = {
  parameters: {
    nextjs: { navigation: { query: { state: 'importing' } } },
  },
};

/** Empty: the artist connected a service but has no releases yet. */
export const EmptyConnected: Story = {
  parameters: {
    nextjs: { navigation: { query: { state: 'connected-empty' } } },
  },
};

/** Error: the release enrichment failed and offers a retry. */
export const ErrorEnrichmentFailed: Story = {
  parameters: {
    nextjs: { navigation: { query: { state: 'failed' } } },
  },
};

/** Partial: enrichment finished with some data missing. */
export const PartialEnrichment: Story = {
  parameters: {
    nextjs: { navigation: { query: { state: 'partial' } } },
  },
};

function RtlDocumentDecorator(Story: () => React.JSX.Element) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

/** Right-to-left: the settings surface inside an RTL document. */
export const RtlSettings: Story = {
  args: { surface: 'settings' },
  decorators: [RtlDocumentDecorator],
};
