import { describe, expect, it } from 'vitest';
import {
  buildSonarQualityDebtReceipt,
  buildVisualConfigurationIncident,
} from '../ci-remediation-receipts.mjs';
import {
  SONAR_CHECK_APP_SLUG,
  SONAR_CHECK_NAME,
  selectLatestFailingSonarCheck,
} from '../sonar-check-selection.mjs';

const sonarCheck = (overrides = {}) => ({
  id: 1,
  name: SONAR_CHECK_NAME,
  app: { slug: SONAR_CHECK_APP_SLUG },
  status: 'completed',
  conclusion: 'failure',
  details_url: 'https://sonarcloud.io/project/pull_requests?id=jovie',
  completed_at: '2026-08-20T01:00:00Z',
  ...overrides,
});
const receiptInput = {
  repository: 'jovie/jovie',
  runId: '42',
  runUrl: 'https://github.com/jovie/jovie/actions/runs/42',
  prNumber: 7,
  headSha: 'b'.repeat(40),
  checkName: SONAR_CHECK_NAME,
  checkConclusion: 'failure',
  checkAppSlug: SONAR_CHECK_APP_SLUG,
  detailsUrl:
    'https://sonarcloud.io/project/pull_requests?id=jovie&pullRequest=7',
  capacity: { openAgentPrs: 4, maxOpenAgentPrs: 5, candidateRank: 2 },
};
describe('trusted Sonar check selection', () => {
  it('selects only the newest authenticated failing check', () => {
    const newest = sonarCheck({ id: 4, completed_at: '2026-08-20T04:00:00Z' });
    expect(
      selectLatestFailingSonarCheck([
        {
          check_runs: [
            sonarCheck({ id: 2, app: { slug: 'attacker' } }),
            sonarCheck({ id: 3, details_url: 'https://attacker.example/' }),
            newest,
          ],
        },
      ])
    ).toEqual(newest);
  });
  it('does not route stale failures behind newer trusted results', () => {
    for (const newer of [
      {
        status: 'in_progress',
        conclusion: null,
        started_at: '2026-08-20T02:00:00Z',
        completed_at: null,
      },
      { id: 3, conclusion: 'success', completed_at: '2026-08-20T03:00:00Z' },
    ])
      expect(
        selectLatestFailingSonarCheck([
          { check_runs: [sonarCheck(), sonarCheck(newer)] },
        ])
      ).toBeNull();
  });
  it('builds owned incident and bounded quality-debt receipts', () => {
    const incident = buildVisualConfigurationIncident({
      ...receiptInput,
      headSha: 'a'.repeat(40),
      configurationErrors: [
        'backend_unconfigured: GROK_VISUAL_REVIEW_API_KEY is missing',
      ],
    });
    expect(incident).toMatchObject({
      type: 'configuration_incident',
      status: 'owned_escalation_required',
      ownership: { owner: 'Gem', verifier: 'Summer' },
      authorization: { humanApprovalRequired: true },
    });
    expect(incident.remediation.forbiddenActions).toContain(
      'invent_credentials'
    );
    expect(buildSonarQualityDebtReceipt(receiptInput)).toMatchObject({
      status: 'owned_capacity_deferred',
      remediation: { attemptBudget: 3, targetHeadSha: 'b'.repeat(40) },
    });
    expect(() =>
      buildSonarQualityDebtReceipt({
        ...receiptInput,
        detailsUrl: 'https://sonarcloud.io/project?pullRequest=8',
      })
    ).toThrow('requires a failing SonarCloud check');
  });
});
