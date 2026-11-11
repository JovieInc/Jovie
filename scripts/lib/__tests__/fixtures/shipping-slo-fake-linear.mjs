import { readFileSync, writeFileSync } from 'node:fs';

// Stateful Linear transport: exercises the production adapter without provider writes.
export function fakeLinear(state) {
  const connection = (rows, after) => {
    const start = Number(after ?? 0);
    const nodes = rows.slice(start, start + 100);
    return {
      nodes,
      pageInfo: {
        hasNextPage: start + nodes.length < rows.length,
        endCursor: String(start + nodes.length),
      },
    };
  };
  return async (url, init) => {
    const { query, variables: v } = JSON.parse(init.body);
    state.calls.push({ url, query, variables: v });
    const reply = data => new Response(JSON.stringify({ data }));
    const mutation = query.includes('mutation');
    if (state.failure === 'lookup' && !mutation) throw new Error('offline');
    if (state.failure === 'graphql')
      return new Response(JSON.stringify({ errors: [{ message: 'denied' }] }));
    if (query.includes('ShippingSloOwner'))
      return reply({ issue: state.owner });
    if (query.includes('ShippingSloIssues')) {
      const rows = state.issues.filter(
        row => row.title === v.title || row.description.includes(v.marker)
      );
      const issues = connection(rows, v.after);
      if (state.failure === 'incomplete')
        issues.pageInfo = { hasNextPage: true, endCursor: null };
      return reply({ issues });
    }
    if (query.includes('ShippingSloCreate')) {
      const number = state.issues.length + 1;
      const issue = {
        ...v.input,
        id: `linear-${number}`,
        identifier: `JOV-${9000 + number}`,
        url: `https://linear.app/jovie/issue/JOV-${9000 + number}`,
        state: { type: 'triage' },
        archivedAt: null,
        comments: [],
      };
      state.issues.push(issue);
      if (state.failure === 'create-after-write') {
        state.failure = null;
        throw new Error('response lost after commit');
      }
      return reply({ issueCreate: { success: true, issue } });
    }
    const issue = state.issues.find(row => row.id === v.id);
    if (query.includes('ReopenLinearIssue')) {
      issue.state = { type: 'triage' };
      if (state.failure === 'reopen-after-write') {
        state.failure = null;
        throw new Error('response lost after reopen');
      }
      return reply({ issueUpdate: { success: true } });
    }
    if (query.includes('ShippingSloComments')) {
      if (state.failure === 'comments') throw new Error('offline');
      return reply({
        issue: { comments: connection(issue.comments, v.after) },
      });
    }
    if (query.includes('AddLinearIssueComment')) {
      const comment = {
        id: `comment-${issue.comments.length + 1}`,
        body: v.body,
      };
      issue.comments.push(comment);
      if (state.failure === 'comment-after-write') {
        state.failure = null;
        throw new Error('response lost after comment');
      }
      return reply({ commentCreate: { success: true, comment } });
    }
    throw new Error(`Unexpected Linear query: ${query}`);
  };
}

if (process.env.SLO_OFFLINE_STATE) {
  const path = process.env.SLO_OFFLINE_STATE;
  const state = JSON.parse(readFileSync(path, 'utf8'));
  const transport = fakeLinear(state);
  globalThis.fetch = async (...args) => {
    try {
      return await transport(...args);
    } finally {
      writeFileSync(path, JSON.stringify(state));
    }
  };
}
