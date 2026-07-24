import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityRow } from './OpportunityRow';

const meta: Meta<typeof OpportunityRow> = {
  title: 'Organisms/OpportunityCard/OpportunityRow',
  component: OpportunityRow,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-[42rem] mx-auto py-8'>
        <div className='divide-y divide-subtle'>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof OpportunityRow>;

export const New: Story = {
  args: {
    id: 'row-new-1',
    state: 'new',
    title: 'Detroit listeners up 340% — book a show',
    metadata: 'Magic Stick · Mar 15 · 92% match · $2,000 fee',
    onPrimaryAction: () => undefined,
    onDismiss: () => undefined,
  },
};

export const Accepted: Story = {
  args: {
    id: 'row-accepted-1',
    state: 'accepted',
    title: 'Chicago underground night looking for support',
    metadata: 'The Hideout · Apr 3 · 78% match · $800 fee',
    onPrimaryAction: () => undefined,
    onDismiss: () => undefined,
  },
};

export const Rejected: Story = {
  args: {
    id: 'row-rejected-1',
    state: 'rejected',
    title: 'Radio interview request — Denver',
    metadata: 'OpenAir · Jun 12 · 45% match',
    onPrimaryAction: () => undefined,
    onDismiss: () => undefined,
  },
};

export const InProgress: Story = {
  args: {
    id: 'row-inprogress-1',
    state: 'in-progress',
    title: 'LA promoter wants a mid-week residency',
    metadata: 'The Echo · 3 nights · 88% match · $4,500 fee',
    onPrimaryAction: () => undefined,
    onDismiss: () => undefined,
  },
};

export const Reported: Story = {
  args: {
    id: 'row-reported-1',
    state: 'reported',
    title: 'Spotify algorithmic playlist add — your track "Cascade"',
    metadata: 'Electro Chill · 150k+ listeners',
    onPrimaryAction: () => undefined,
    onDismiss: () => undefined,
  },
};

/** All five states rendered in a list for side-by-side comparison. */
export const AllStates: Story = {
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-[42rem] mx-auto py-8'>
        <div className='divide-y divide-subtle'>
          <Story />
        </div>
      </div>
    ),
  ],
  render: () => (
    <div className='divide-y divide-subtle'>
      <OpportunityRow
        id='demo-new'
        state='new'
        title='New: Detroit listeners up 340% — book a show'
        metadata='Magic Stick · Mar 15 · 92% match · $2,000 fee'
        onPrimaryAction={id => console.log('primary', id)}
        onDismiss={id => console.log('dismiss', id)}
      />
      <OpportunityRow
        id='demo-accepted'
        state='accepted'
        title='Accepted: Chicago underground night'
        metadata='The Hideout · Apr 3 · 78% match · $800 fee'
        onPrimaryAction={id => console.log('primary', id)}
        onDismiss={id => console.log('dismiss', id)}
      />
      <OpportunityRow
        id='demo-rejected'
        state='rejected'
        title='Rejected: Radio interview request'
        metadata='OpenAir · Jun 12 · 45% match'
        onPrimaryAction={id => console.log('primary', id)}
        onDismiss={id => console.log('dismiss', id)}
      />
      <OpportunityRow
        id='demo-inprogress'
        state='in-progress'
        title='In progress: LA mid-week residency'
        metadata='The Echo · 3 nights · 88% match · $4,500 fee'
        onPrimaryAction={id => console.log('primary', id)}
        onDismiss={id => console.log('dismiss', id)}
      />
      <OpportunityRow
        id='demo-reported'
        state='reported'
        title='Reported: Spotify algorithmic playlist add'
        metadata='Electro Chill · 150k+ listeners'
        onPrimaryAction={id => console.log('primary', id)}
        onDismiss={id => console.log('dismiss', id)}
      />
    </div>
  ),
};
