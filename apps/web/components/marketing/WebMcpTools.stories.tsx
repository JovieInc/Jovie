import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WebMcpTools } from './WebMcpTools';

const meta = {
  title: 'Marketing/WebMcpTools',
  component: WebMcpTools,
  parameters: {
    docs: {
      description: {
        component:
          'Homepage WebMCP adapter. Renders no visible UI and registers a read-only public profile tool only when the browser exposes modelContext. Component tests cover registration, failure handling and unmount cleanup.',
      },
    },
  },
} satisfies Meta<typeof WebMcpTools>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mounted: Story = {};

/**
 * Error: the browser exposes modelContext but registration throws. The
 * adapter swallows the failure, makes no request and the page stays mounted.
 */
export const ErrorRegistrationThrows: Story = {
  beforeEach: () => {
    const original = Object.getOwnPropertyDescriptor(document, 'modelContext');
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool: () => {
          throw new Error('WebMCP registration unavailable');
        },
      },
    });
    return () => {
      if (original) Object.defineProperty(document, 'modelContext', original);
      else Reflect.deleteProperty(document, 'modelContext');
    };
  },
  render: () => (
    <div className='text-sm text-secondary-token'>
      <WebMcpTools />
      <p>Registration failed quietly; the page is still here.</p>
    </div>
  ),
};
