import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta = { title: 'Diagnostics/A11y runner controls' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultHealthy: Story = {
  render: () => <button type='button'>Save</button>,
};
export const DefaultViolation: Story = {
  // Intentional button-name violation; this file is outside the default catalog.
  render: () => <button type='button' />,
};
export const ErrorHealthy: Story = {
  ...DefaultHealthy,
  parameters: { a11y: { test: 'error' } },
};
export const ErrorViolation: Story = {
  ...DefaultViolation,
  parameters: { a11y: { test: 'error' } },
};
