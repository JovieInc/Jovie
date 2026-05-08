import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AgentOsRunsPanel } from '@/components/features/admin/agent-os';
import { AGENT_OS_ADMIN_FIXTURE_ARTIFACTS } from '@/lib/agent-os/fixtures';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('AgentOsRunsPanel', () => {
  it('renders fixture runs with status, approval, and gate details', async () => {
    render(<AgentOsRunsPanel artifacts={AGENT_OS_ADMIN_FIXTURE_ARTIFACTS} />);

    expect(screen.getByTestId('agent-os-runs-panel')).toBeInTheDocument();
    expect(screen.getByText('AgentOS Runs')).toBeInTheDocument();
    expect(screen.getAllByText('WDK health dry run').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Main post-merge verification').length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Trigger.dev deploy check mismatch').length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Unsafe dispatch payload rejected').length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('AgentRunArtifact schema landed').length
    ).toBeGreaterThan(0);

    for (const label of [
      'Queued',
      'Running',
      'Review',
      'Blocked',
      'Failed',
      'Done',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    expect(screen.getByText('Approval Queue')).toBeInTheDocument();
    expect(screen.getAllByText('Review Required').length).toBeGreaterThan(0);

    const drawer = screen.getByTestId('agent-os-artifact-drawer');
    expect(drawer).toHaveTextContent('WDK health dry run');
    expect(drawer).toHaveTextContent('Verification Gates');

    await userEvent.click(
      screen.getAllByTestId('agent-os-run-agentos-run-blocked-trigger-check')[0]
    );

    expect(screen.getByTestId('agent-os-artifact-drawer')).toHaveTextContent(
      'Trigger.dev deploy check mismatch'
    );
    expect(screen.getByTestId('agent-os-artifact-drawer')).toHaveTextContent(
      'Trigger.dev deploy integration expects trigger.config.ts'
    );
  });

  it('renders an empty table and empty approval queue', () => {
    render(<AgentOsRunsPanel artifacts={[]} />);

    expect(screen.getAllByText('No AgentOS runs').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        'AgentRunArtifact records will appear here after a workflow emits them.'
      ).length
    ).toBeGreaterThan(0);

    expect(screen.getByText('No approvals waiting.')).toBeInTheDocument();
  });
});
