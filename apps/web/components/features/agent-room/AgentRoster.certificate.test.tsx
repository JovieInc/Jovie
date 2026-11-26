import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AgentRoster } from './AgentRoster';
import { fleetRoomFixtureView } from './fixtures';

describe('AgentRoster certificate', () => {
  it('renders the fleet roster axe-clean', async () => {
    const { agents } = fleetRoomFixtureView();
    const { container } = render(<AgentRoster agents={agents} />);
    expect(screen.getAllByTestId('agent-room-agent')).toHaveLength(
      agents.length
    );
    await expectNoA11yViolations(container);
  });

  it('renders an empty roster axe-clean', async () => {
    const { container } = render(<AgentRoster agents={[]} />);
    expect(screen.queryAllByTestId('agent-room-agent')).toHaveLength(0);
    expect(screen.getByTestId('agent-roster')).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('shows the excerpt only for a blocked agent and merges className', async () => {
    const [first] = fleetRoomFixtureView().agents;
    const { container } = render(
      <AgentRoster
        className='max-h-40'
        agents={[
          { ...first, presence: 'blocked', lastExcerpt: 'Waiting on review' },
          { ...first, id: 'other', presence: 'active', lastExcerpt: 'Hidden' },
        ]}
      />
    );
    expect(screen.getByText('Waiting on review')).toBeVisible();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByTestId('agent-roster')).toHaveClass('max-h-40');
    await expectNoA11yViolations(container);
  });
});
