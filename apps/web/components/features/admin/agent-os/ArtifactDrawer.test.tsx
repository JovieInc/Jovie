import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtifactDrawer } from './ArtifactDrawer';
import {
  buildArtifact,
  buildFailedArtifact,
  buildPendingApprovalArtifact,
  LONG_RUN_TITLE,
} from './agentOsArtifact.test-fixtures';

describe('ArtifactDrawer', () => {
  it('asks for a selection when no run is selected', async () => {
    const { container } = render(<ArtifactDrawer artifact={null} />);
    expect(
      screen.getByText('Select a run to inspect its gates.')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('agent-os-artifact-drawer')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows run details, cost, links and gates for a selected run', async () => {
    const { container } = render(<ArtifactDrawer artifact={buildArtifact()} />);
    expect(screen.getByTestId('agent-os-artifact-drawer')).toBeInTheDocument();
    expect(
      screen.getByText('Add stories for ranked feature components')
    ).toBeInTheDocument();
    expect(screen.getByText('github')).toBeInTheDocument();
    expect(screen.getByText('claude-code')).toBeInTheDocument();
    expect(screen.getByText('$0.42')).toBeInTheDocument();
    expect(screen.getByText('Not Required')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'JOV-6778 (opens in a new tab)' })
    ).toHaveAttribute('href', 'https://linear.app/jovieinc/issue/JOV-6778');
    expect(
      screen.getByRole('link', { name: '#19385 (opens in a new tab)' })
    ).toHaveAttribute('href', 'https://github.com/JovieInc/Jovie/pull/19385');
    expect(screen.getByText('GitHub / CI')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('moves keyboard focus from the Linear link to the PR link', async () => {
    const user = userEvent.setup();
    render(<ArtifactDrawer artifact={buildArtifact()} />);
    await user.tab();
    expect(
      screen.getByRole('link', { name: 'JOV-6778 (opens in a new tab)' })
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('link', { name: '#19385 (opens in a new tab)' })
    ).toHaveFocus();
  });

  it('formats a missing and a zero cost estimate', () => {
    const { rerender } = render(
      <ArtifactDrawer artifact={buildArtifact({ costEstimate: null })} />
    );
    expect(screen.getByText('Not estimated')).toBeInTheDocument();
    rerender(
      <ArtifactDrawer
        artifact={buildArtifact({
          costEstimate: {
            usd: 0,
            route: 'deterministic',
            inputTokens: null,
            outputTokens: null,
            notes: null,
          },
        })}
      />
    );
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('falls back to generic link labels and drops unsafe links', () => {
    render(
      <ArtifactDrawer
        artifact={buildArtifact({
          linearIssueId: null,
          pullRequestUrl: 'https://github.com/JovieInc/Jovie/pulls',
          linearIssueUrl: 'https://linear.app/jovieinc/issue/JOV-1',
        })}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Linear (opens in a new tab)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Pull Request (opens in a new tab)' })
    ).toBeInTheDocument();
  });

  it('hides links on a disallowed host', () => {
    render(
      <ArtifactDrawer
        artifact={buildArtifact({
          pullRequestUrl: 'https://gitlab.com/JovieInc/Jovie/pull/2',
          linearIssueUrl: 'http://linear.app/jovieinc/issue/JOV-1',
        })}
      />
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the blocked reason and failed gate for an error run', async () => {
    const { container } = render(
      <ArtifactDrawer artifact={buildFailedArtifact()} />
    );
    expect(
      screen.getByText(
        'CI failed on the head SHA; the migration test timed out.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('Failed')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('shows the pending human gate and an empty gate list', async () => {
    const { container } = render(
      <ArtifactDrawer
        artifact={buildPendingApprovalArtifact({ verificationGates: [] })}
      />
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('No gates recorded.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long content in an RTL document axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ArtifactDrawer artifact={buildArtifact({ title: LONG_RUN_TITLE })} />
      </div>
    );
    expect(screen.getByText(LONG_RUN_TITLE)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
