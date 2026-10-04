#!/usr/bin/env node
// Invariant consumer: JOV-INV-041.
import { pathToFileURL } from 'node:url';

import { evaluateEscapedDefectClosure } from './lib/escaped-defect-closure.mjs';

const LINEAR_API = 'https://api.linear.app/graphql';

/**
 * @typedef {{
 *   ok: boolean,
 *   status?: number,
 *   statusText?: string,
 *   text?: () => Promise<string>,
 *   json: () => Promise<any>,
 * }} HttpResponse
 * @typedef {(
 *   input: string | URL | Request,
 *   init?: RequestInit,
 * ) => Promise<HttpResponse>} HttpFetch
 */

/**
 * @param {{
 *   identifier: string,
 *   targetState?: string,
 *   comment?: string,
 *   apiKey: string,
 *   expectedDeploymentSha?: string,
 *   fetchImpl?: HttpFetch,
 *   log?: (message: string) => void,
 * }} input
 */
export async function transitionLinearIssue({
  identifier,
  targetState = 'Done',
  comment = '',
  apiKey,
  expectedDeploymentSha = '',
  fetchImpl = globalThis.fetch,
  log = message => console.log(message),
}) {
  const normalizedIdentifier = String(identifier ?? '').toUpperCase();
  const normalizedTargetState = String(targetState).trim().toLowerCase();
  const match = normalizedIdentifier.match(/^JOV-(\d+)$/);
  if (!match || !normalizedTargetState || !apiKey) {
    throw new Error(
      'A JOV issue identifier, target state, and LINEAR_API_KEY are required'
    );
  }

  async function gql(query, variables = {}) {
    const response = await fetchImpl(LINEAR_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      const body = response.text ? await response.text() : '';
      throw new Error(
        `Linear API request failed (${response.status} ${response.statusText}): ${body}`
      );
    }
    const payload = await response.json();
    if (payload.errors) throw new Error(JSON.stringify(payload.errors));
    return payload.data;
  }

  const { issues } = await gql(
    `query($n: Float!) { issues(filter: { team: { key: { eq: "JOV" } }, number: { eq: $n } }, first: 1) { nodes { id identifier description labels { nodes { name } } comments(first: 50) { nodes { body } } team { states { nodes { id name } } } } } }`,
    { n: Number.parseInt(match[1], 10) }
  );
  const issue = issues?.nodes?.[0];
  if (!issue) {
    throw new Error(`Linear issue ${normalizedIdentifier} not found`);
  }
  if (issue.identifier.toUpperCase() !== normalizedIdentifier) {
    throw new Error(
      `Linear issue mismatch: expected ${normalizedIdentifier}, got ${issue.identifier}`
    );
  }
  if (normalizedTargetState === 'done') {
    const closure = evaluateEscapedDefectClosure(issue, {
      expectedDeploymentSha,
    });
    if (closure.applicable) {
      if (!/^[0-9a-f]{40}$/i.test(expectedDeploymentSha)) {
        throw new Error(
          `Refusing to mark ${issue.identifier} Done: PRODUCTION_VERIFIED_SHA must bind closure to the exact deployed commit`
        );
      }
      if (!closure.ok) {
        throw new Error(
          `Refusing to mark ${issue.identifier} Done: ${closure.errors.join('; ')}`
        );
      }
    }
  }
  const states = issue.team?.states?.nodes ?? [];
  const state = states.find(
    candidate => candidate.name.trim().toLowerCase() === normalizedTargetState
  );
  if (!state) {
    throw new Error(
      `Linear state "${targetState}" not found for ${issue.identifier}`
    );
  }
  const updated = await gql(
    `mutation($id: String!, $sid: String!) { issueUpdate(id: $id, input: { stateId: $sid }) { success } }`,
    { id: issue.id, sid: state.id }
  );
  if (updated.issueUpdate?.success !== true) {
    throw new Error(`Linear refused to transition ${issue.identifier}`);
  }
  if (comment) {
    const commented = await gql(
      `mutation($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }`,
      { id: issue.id, body: comment }
    );
    if (commented.commentCreate?.success !== true) {
      throw new Error(`Linear refused the comment on ${issue.identifier}`);
    }
  }
  log(`${issue.identifier} → ${state.name}`);
  return { identifier: issue.identifier, state: state.name };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  transitionLinearIssue({
    identifier: process.argv[2] ?? '',
    targetState: process.argv[3] ?? 'Done',
    comment: process.argv[4] ?? '',
    apiKey: process.env.LINEAR_API_KEY ?? '',
    expectedDeploymentSha: process.env.PRODUCTION_VERIFIED_SHA ?? '',
  }).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
