import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AgentOsRunsPanel } from './AgentOsRunsPanel';
import {
  buildArtifact,
  buildFailedArtifact,
} from './agentOsArtifact.test-fixtures';

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const artifacts = [
  buildArtifact({ id: 'run-1', title: 'First run' }),
  buildFailedArtifact({ id: 'run-2', title: 'Second run' }),
];

describe('AgentOsRunsPanel', () => {
  it('shows the empty subtitle and stays axe-clean with no runs', async () => {
    const { container } = render(<AgentOsRunsPanel artifacts={[]} />);
    expect(screen.getByText('0 artifacts')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('selects a board card with aria-pressed and a borderless view toggle', async () => {
    const user = userEvent.setup();
    const { container } = render(<AgentOsRunsPanel artifacts={artifacts} />);

    const board = screen.getByRole('button', { name: /Board/ });
    expect(board).toHaveAttribute('aria-pressed', 'true');
    expect(board.parentElement).toHaveClass('bg-surface-1');
    expect(board.parentElement).not.toHaveClass('border');

    const second = screen.getByRole('button', {
      name: /Select run:\s*Second run/,
    });
    expect(second).toHaveAttribute('aria-pressed', 'false');
    await user.click(second);
    expect(second).toHaveAttribute('aria-pressed', 'true');
    await expectNoA11yViolations(container);
  });

  it('renders the status and summary slots passed by the caller', () => {
    render(
      <AgentOsRunsPanel
        artifacts={artifacts}
        status={<span>Offline. Showing last known runs.</span>}
        summary='2 runs, 1 failed'
      />
    );
    expect(screen.getByText('Offline. Showing last known runs.')).toBeVisible();
    expect(screen.getByText('2 runs, 1 failed')).toBeVisible();
  });
});
