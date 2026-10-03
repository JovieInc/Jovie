import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MARKETING_AMBIENT_ACCENTS,
  MarketingAmbientField,
} from './MarketingAmbientField';

const meta: Meta<typeof MarketingAmbientField> = {
  title: 'Marketing/Motion/MarketingAmbientField',
  component: MarketingAmbientField,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    accent: { control: 'select', options: MARKETING_AMBIENT_ACCENTS },
  },
  decorators: [
    Story => (
      <section className='relative grid h-[640px] place-items-center overflow-hidden bg-base text-center text-primary-token'>
        <Story />
        <h2 className='relative text-5xl font-semibold'>
          Be found. Be understood.
        </h2>
      </section>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Blue: Story = { args: { accent: 'blue' } };

export const Purple: Story = { args: { accent: 'purple' } };
