import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ExportCSVButton } from './ExportCSVButton';

interface ExportRow {
  readonly name: string;
  readonly email: string;
}

const rows: ExportRow[] = [
  { name: 'Jamie Rivera', email: 'jamie@example.com' },
  { name: 'Alex Chen', email: 'alex@example.com' },
];

const meta = {
  title: 'Organisms/Table/Molecules/ExportCSVButton',
  component: ExportCSVButton<ExportRow>,
  parameters: {
    layout: 'centered',
  },
  args: {
    getData: () => rows,
    filename: 'audience-export',
  },
} satisfies Meta<typeof ExportCSVButton<ExportRow>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const IconOnly: Story = {
  args: {
    iconOnly: true,
    tooltipLabel: 'Export CSV',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const PageToolbarChrome: Story = {
  args: {
    chrome: 'page-toolbar',
    iconOnly: true,
    tooltipLabel: 'Export CSV',
  },
};
