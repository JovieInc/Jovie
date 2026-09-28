import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  intentSimilarity,
  normalizeIntent,
  reconcileConversationRequest,
} from '../conversation-intake.mjs';

const request = {
  title: 'Archive stale Telegram chats',
  summary: 'Telegram cleanup was requested again.',
  conversationReceipt: {
    id: 'conversation-20260727-4',
    url: 'https://example.test/conversations/20260727#4',
  },
  evidence: [{ url: 'https://example.test/audit/20260727' }],
};

function client(issues) {
  const calls = { comments: [], creates: [] };
  return {
    calls,
    async fetchTeamActiveIssueSnapshot() {
      return {
        issues,
        coverage: { complete: true, pages: 1, scanned: issues.length },
      };
    },
    async addComment(id, body) {
      calls.comments.push({ id, body });
      return { commentCreate: { success: true } };
    },
    async createIssue(input) {
      calls.creates.push(input);
      return {
        issueCreate: {
          issue: {
            id: 'new-id',
            identifier: 'JOV-5000',
            url: 'https://linear.app/jovie/issue/JOV-5000/new',
            state: { name: 'Triage' },
          },
        },
      };
    },
  };
}

describe('conversation issue reconciliation', () => {
  it('normalizes wording and scores repeated intent highly', () => {
    assert.deepEqual(normalizeIntent('Requested: archiving Telegram chats'), [
      'archiv',
      'chat',
      'telegram',
    ]);
    assert.ok(
      intentSimilarity(
        'Archive stale Telegram chats',
        'Missed Telegram chat archiving never completed despite 5 requests'
      ) >= 0.82
    );
  });

  it('links new evidence to one canonical open issue and reports its state', async () => {
    const api = client([
      {
        id: 'existing-id',
        identifier: 'JOV-4423',
        title:
          'Missed Telegram chat archiving never completed despite requests',
        description: '',
        url: 'https://linear.app/jovie/issue/JOV-4423/existing',
        state: { name: 'Todo' },
        comments: { nodes: [] },
      },
    ]);
    const receipt = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });

    assert.equal(receipt.disposition, 'existing_issue');
    assert.ok('canonicalIssue' in receipt);
    assert.equal(receipt.canonicalIssue.identifier, 'JOV-4423');
    assert.equal(receipt.canonicalIssue.state, 'Todo');
    assert.deepEqual(receipt.counts, {
      canonicalMatches: 1,
      reviewCandidates: 0,
      issuesCreated: 0,
      receiptsLinked: 1,
    });
    assert.equal(api.calls.creates.length, 0);
    assert.match(api.calls.comments[0].body, /conversations\/20260727/);
    assert.match(api.calls.comments[0].body, /audit\/20260727/);
  });

  it('is idempotent for a receipt already attached to the canonical issue', async () => {
    const api = client([
      {
        id: 'existing-id',
        identifier: 'JOV-4423',
        title: 'Archive stale Telegram chats',
        url: 'https://linear.app/jovie/issue/JOV-4423/existing',
        state: { name: 'In Progress' },
        comments: {
          nodes: [
            {
              body: '<!-- conversation-receipt:fb9f3950e1a099fe -->',
            },
          ],
        },
      },
    ]);
    const first = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });
    api.calls.comments.length = 0;
    api.calls.comments.push({
      body: `<!-- conversation-receipt:${first.receiptKey} -->`,
    });
    api.fetchTeamActiveIssueSnapshot = async () => ({
      issues: [
        {
          id: 'existing-id',
          identifier: 'JOV-4423',
          title: request.title,
          url: 'https://linear.app/jovie/issue/JOV-4423/existing',
          state: { name: 'In Progress' },
          comments: { nodes: api.calls.comments },
        },
      ],
      coverage: { complete: true, pages: 1, scanned: 1 },
    });
    const second = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });
    assert.equal(second.mutation, 'already_linked');
    assert.equal(second.counts.receiptsLinked, 0);
    assert.equal(api.calls.comments.length, 1);
  });

  it('fails closed for a near duplicate below the safe merge threshold', async () => {
    const api = client([
      {
        id: 'candidate-id',
        identifier: 'JOV-4425',
        title: 'Archive Telegram cleanup health',
        url: 'https://linear.app/jovie/issue/JOV-4425/candidate',
        state: { name: 'Triage' },
        comments: { nodes: [] },
      },
    ]);
    const receipt = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });
    assert.equal(receipt.disposition, 'human_review');
    assert.ok('reviewCandidates' in receipt);
    assert.equal(receipt.mutation, 'none');
    assert.equal(receipt.reviewCandidates[0].identifier, 'JOV-4425');
    assert.equal(api.calls.creates.length, 0);
    assert.equal(api.calls.comments.length, 0);
  });

  it('creates only when the active backlog has materially different intent', async () => {
    const api = client([
      {
        id: 'other-id',
        identifier: 'JOV-99',
        title: 'Improve billing invoice retries',
        description: '',
        url: 'https://linear.app/jovie/issue/JOV-99/other',
        state: { name: 'Todo' },
      },
    ]);
    const receipt = await reconcileConversationRequest({
      request,
      teamId: 'team',
      stateId: 'triage',
      client: api,
    });
    assert.equal(receipt.disposition, 'new_issue');
    assert.ok('canonicalIssue' in receipt);
    assert.equal(receipt.canonicalIssue.identifier, 'JOV-5000');
    assert.equal(api.calls.creates.length, 1);
    assert.match(api.calls.creates[0].description, /Conversation receipts/);
  });

  it('rejects incomplete open-issue coverage before mutation', async () => {
    const api = client([]);
    api.fetchTeamActiveIssueSnapshot = async () => ({
      issues: [],
      coverage: { complete: false, pages: 0, scanned: 0 },
    });
    await assert.rejects(
      reconcileConversationRequest({
        request,
        teamId: 'team',
        stateId: 'triage',
        client: api,
      }),
      /snapshot is incomplete/
    );
    assert.equal(api.calls.creates.length, 0);
  });

  it('does not claim a receipt was linked when Linear rejects the comment', async () => {
    const api = client([
      {
        id: 'existing-id',
        identifier: 'JOV-4423',
        title: request.title,
        url: 'https://linear.app/jovie/issue/JOV-4423/existing',
        state: { name: 'Todo' },
        comments: { nodes: [] },
      },
    ]);
    api.addComment = async () => ({ commentCreate: { success: false } });
    await assert.rejects(
      reconcileConversationRequest({
        request,
        teamId: 'team',
        stateId: 'triage',
        client: api,
      }),
      /receipt link failed/
    );
  });
});
