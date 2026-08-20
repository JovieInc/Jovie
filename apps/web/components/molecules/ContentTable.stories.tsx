import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentTable, ContentTableStateRow } from './ContentTable';

const meta: Meta<typeof ContentTable> = {
  title: 'Molecules/ContentTable',
  component: ContentTable,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof ContentTable>;

export const Loading: Story = {
  render: () => (
    <ContentTable aria-label='Contacts'>
      <tbody>
        <ContentTableStateRow
          colSpan={2}
          isLoading
          emptyMessage='No contacts yet'
          loadingLabel='Loading contacts'
        />
      </tbody>
    </ContentTable>
  ),
};

export const Empty: Story = {
  render: () => (
    <ContentTable aria-label='Contacts'>
      <tbody>
        <ContentTableStateRow colSpan={2} emptyMessage='No contacts yet' />
      </tbody>
    </ContentTable>
  ),
};
