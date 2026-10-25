import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatHomeSurface } from './ChatHomeSurface';

const meta = {
  title: 'Jovie/ChatHomeSurface',
  component: ChatHomeSurface,
  parameters: { layout: 'padded' },
  args: {
    state: 'home',
    children: (
      <p className='text-primary-token'>
        Suggestions and wins (Jovie) or the company HUD (Ovie) render here.
      </p>
    ),
  },
} satisfies Meta<typeof ChatHomeSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {};
/** Typing fades the surface out; emptying the composer brings it back. */
export const Composing: Story = { args: { state: 'composing' } };
