import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoAudienceWorkspace } from './DemoAudienceWorkspace';

/**
 * State coverage for the /demo audience workspace. It takes no props and
 * always reads the fixed demo audience, so its empty and error states belong
 * to DashboardAudienceWorkspace (see the waivers in
 * docs/design-system/component-certification.json).
 */
const meta = {
  title: 'Features/Demo/DemoAudienceWorkspace States',
  component: DemoAudienceWorkspace,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DemoAudienceWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the demo audience inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
