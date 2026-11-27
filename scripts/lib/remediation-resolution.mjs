import {
  addLinearIssueComment,
  ISSUE_FIELDS,
  JOVIE_TEAM_ID,
  linearGraphql,
  remediationKey,
  resolveLinearIssueByFingerprint,
} from './linear-issue-intake.mjs';
import { matchesWorkflowRedBinding } from './workflow-outcome-proof.mjs';

export async function resolveRemediationEvidence(
  { fingerprint, source, runUrl, redBinding, recoveryProof, apiKey, fetchImpl },
  incidentFor,
  GREEN_MARKER
) {
  // A member going green does not prove the shared incident is over, unless it
  // measures the condition itself (production current vs main). Other members
  // leave the owner's issue open; the canonical owner's green resolves it.
  const group = incidentFor(fingerprint);
  if (group && group.canonical !== fingerprint) {
    if (!group.resolvers?.includes(fingerprint)) {
      return { ok: true, action: 'none', reason: 'shared_incident_member' };
    }
    return noteFingerprintedIssueGreen({
      fingerprint: group.canonical,
      source: group.canonicalSource,
      commentMarker: GREEN_MARKER,
      comment: `${GREEN_MARKER}\n\`${fingerprint}\` (${source}) verified the condition is gone.\nRun: ${runUrl || '(run url unavailable)'}`,
      apiKey,
      fetchImpl,
    });
  }
  const sourceLine = `Source-workflow: ${source}`;
  return noteFingerprintedIssueGreen({
    fingerprint,
    source,
    commentMarker: GREEN_MARKER,
    verifyEvidence:
      redBinding === undefined
        ? undefined
        : description => matchesWorkflowRedBinding(description, redBinding),
    comment: [
      GREEN_MARKER,
      `${sourceLine} is green.`,
      `Run: ${runUrl || '(run url unavailable)'}`,
      ...(recoveryProof ? ['', 'Recovered probes:', recoveryProof] : []),
    ].join('\n'),
    apiKey,
    fetchImpl,
  });
}

async function noteFingerprintedIssueGreen({
  fingerprint,
  source,
  verifyEvidence = undefined,
  comment,
  commentMarker = '<!-- remediation-green -->',
  apiKey = process.env.LINEAR_API_KEY,
  fetchImpl = fetch,
}) {
  if (!apiKey) return { ok: false, reason: 'missing_linear_api_key' };
  if (typeof fingerprint !== 'string' || fingerprint.trim().length === 0) {
    return { ok: false, reason: 'missing_fingerprint' };
  }
  const labelName = remediationKey(fingerprint);
  const found = await linearGraphql(
    {
      query: `
        query FindRemediationForGreen($teamId: String!, $teamFilterId: ID!, $labelName: String!) {
          team(id: $teamId) { states { nodes { id name type } } }
          issues(
            filter: {
              team: { id: { eq: $teamFilterId } }
              labels: { some: { name: { eq: $labelName } } }
            }
            first: 25
          ) { nodes { ${ISSUE_FIELDS} } }
        }
      `,
      variables: {
        teamId: JOVIE_TEAM_ID,
        teamFilterId: JOVIE_TEAM_ID,
        labelName,
      },
      apiKey,
      fetchImpl,
    },
    'linear_label_search'
  );
  if (!found.ok) return found;
  const match = resolveLinearIssueByFingerprint(
    found.data?.issues?.nodes,
    fingerprint
  );
  if (!match)
    return verifyEvidence
      ? { ok: true, action: 'hold', reason: 'linear_red_issue_missing' }
      : { ok: true, action: 'none' };
  const terminal = ['completed', 'canceled'].includes(match.state?.type);
  if (terminal && !verifyEvidence) {
    return { ok: true, action: 'already_closed', id: match.id };
  }
  const sourceLine = source ? `Source-workflow: ${source}` : '';
  if (verifyEvidence && !verifyEvidence(match.description))
    return { ok: true, action: 'hold', reason: 'linear_red_evidence_changed' };
  if (terminal) {
    return match.state.type === 'completed'
      ? { ok: true, action: 'already_closed', id: match.id }
      : { ok: true, action: 'hold', reason: 'linear_red_issue_canceled' };
  }
  if (sourceLine && !String(match.description ?? '').includes(sourceLine)) {
    if (verifyEvidence)
      return { ok: true, action: 'hold', reason: 'linear_red_source_changed' };
    return {
      ok: true,
      action: 'source_mismatch',
      id: match.id,
      identifier: match.identifier ?? null,
    };
  }
  const post = () =>
    addLinearIssueComment({
      issueId: match.id,
      body: comment || `${commentMarker}\n${sourceLine} is green.`,
      apiKey,
      fetchImpl,
    });
  if (!verifyEvidence) {
    const posted = await post();
    if (!posted.ok) return posted;
  } else if (!match.state?.id) {
    return { ok: false, reason: 'linear_open_state_missing' };
  }
  const states = found.data?.team?.states?.nodes ?? [];
  const done =
    states.find(state => state?.name === 'Done') ??
    states.find(state => state?.type === 'completed');
  if (!done?.id) return { ok: false, reason: 'linear_done_state_missing' };
  const updated = await linearGraphql(
    {
      query: `
        mutation ResolveRemediation($id: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { stateId: $stateId }) {
            success
            issue { id identifier url description state { id type } }
          }
        }
      `,
      variables: { id: match.id, stateId: done.id },
      apiKey,
      fetchImpl,
    },
    'linear_update'
  );
  if (verifyEvidence) {
    const result = updated.ok ? updated.data?.issueUpdate : null;
    const responseIssue = result?.issue;
    if (
      result?.success &&
      responseIssue?.id === match.id &&
      responseIssue.state?.id === done.id &&
      responseIssue.state.type === 'completed' &&
      verifyEvidence(responseIssue.description)
    ) {
      const posted = await post();
      if (!posted.ok) return posted;
    } else if (
      updated.ok ||
      /_(?:transport|5\d\d|graphql_error)$/.test(updated.reason)
    ) {
      return restoreOpenEvidence({ match, apiKey, fetchImpl });
    }
  }
  if (!updated.ok) return updated;
  if (!updated.data?.issueUpdate?.success) {
    return {
      ok: false,
      reason: 'linear_update_unsuccessful',
      body: updated.raw,
    };
  }
  return {
    ok: true,
    action: 'resolved',
    id: match.id,
    identifier: updated.data.issueUpdate.issue?.identifier ?? match.identifier,
    url: updated.data.issueUpdate.issue?.url ?? match.url,
  };
}

// Linear issueUpdate offers no compare-and-set. If the returned issue cannot
// confirm this close, restore the known open state without altering evidence.
async function restoreOpenEvidence({ match, apiKey, fetchImpl }) {
  const restored = await linearGraphql(
    {
      query: `
      mutation RestoreRemediationOpen($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) {
          success
          issue { id state { id type } }
        }
      }
    `,
      variables: { id: match.id, stateId: match.state.id },
      apiKey,
      fetchImpl,
    },
    'linear_recovery_restore'
  );
  const update = restored.ok ? restored.data?.issueUpdate : null;
  const confirmed =
    update?.success &&
    update.issue?.id === match.id &&
    update.issue.state?.id === match.state.id;
  return {
    ok: false,
    reason: confirmed
      ? 'linear_close_evidence_unconfirmed_restored'
      : 'linear_close_evidence_unconfirmed_restore_failed',
  };
}
