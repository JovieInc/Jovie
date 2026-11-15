import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { buildGate, LONG_RUN_SUMMARY } from './agentOsArtifact.test-fixtures';
import { formatGateName, VerificationGateList } from './VerificationGateList';

describe('VerificationGateList', () => {
  it('shows the empty copy when no gate was recorded', async () => {
    const { container } = render(<VerificationGateList gates={[]} />);
    expect(screen.getByText('No gates recorded.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lists each gate with its label, requirement and status', async () => {
    const { container } = render(
      <VerificationGateList
        gates={[
          buildGate({ name: 'github.ci', summary: 'CI passed on the head.' }),
          buildGate({
            name: 'gstack.review',
            required: false,
            status: 'missing',
            summary: null,
          }),
        ]}
      />
    );
    expect(screen.getByText('GitHub / CI')).toBeInTheDocument();
    expect(screen.getByText('CI passed on the head.')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('GStack / Review')).toBeInTheDocument();
    expect(screen.getByText('Optional gate.')).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByText('Missing')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the required copy when a required gate has no summary', () => {
    render(<VerificationGateList gates={[buildGate({ summary: null })]} />);
    expect(screen.getByText('Required gate.')).toBeInTheDocument();
  });

  it('keeps long summaries readable and axe-clean', async () => {
    const { container } = render(
      <VerificationGateList
        gates={[buildGate({ status: 'failed', summary: LONG_RUN_SUMMARY })]}
      />
    );
    expect(screen.getByText(LONG_RUN_SUMMARY)).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders inside an RTL document without violations', async () => {
    const { container } = render(
      <div dir='rtl'>
        <VerificationGateList
          gates={[buildGate({ summary: 'نجحت جميع الفحوصات.' })]}
        />
      </div>
    );
    expect(screen.getByText('نجحت جميع الفحوصات.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('formats every known gate name', () => {
    expect(formatGateName('sentry.canary')).toBe('Sentry / Canary');
    expect(formatGateName('github.scope-judge')).toBe('GitHub / Scope Judge');
  });
});
